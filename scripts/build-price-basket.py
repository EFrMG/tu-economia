"""Builds the Precios reference basket from the SEPA retail-price archive.

The archive is a ~320 MB ZIP per weekday published by the Subsecretaría de Defensa del Consumidor y Lealtad Comercial under CC BY 4.0
(https://datos.produccion.gob.ar/dataset/sepa-precios). See docs/product-price-feed.md for the format and the refresh routine.

Only the standard library is used. Run with `python3 -I` (3.11+); the archive is untrusted input and is only parsed, never executed.

    python3 -I scripts/build-price-basket.py download --work ~/sepa
    python3 -I scripts/build-price-basket.py aggregate --archive ~/sepa/sepa_jueves.zip --work ~/sepa
    python3 -I scripts/build-price-basket.py candidates --work ~/sepa
    python3 -I scripts/build-price-basket.py build --work ~/sepa
"""

import argparse
import csv
import datetime as dt
import gzip
import io
import json
import math
import re
import shutil
import statistics
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

csv.field_size_limit(10_000_000)

REPO = Path(__file__).resolve().parent.parent
PACKAGE_URL = "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios"

# Downloads are accepted only over HTTPS from the publisher's host, including after redirects.
ALLOWED_HOSTS = {"datos.produccion.gob.ar"}
MAX_DOWNLOAD_BYTES = 1_000_000_000

# Archive limits. A real day is ~17 commerce ZIPs of three CSVs each, the largest CSV ~520 MB at a ratio of ~6.
MAX_OUTER_ENTRIES = 200
MAX_INNER_ENTRIES = 10
MAX_ENTRY_BYTES = 2_000_000_000
MAX_TOTAL_BYTES = 12_000_000_000
MAX_COMPRESSION_RATIO = 50
INNER_FILES = {"comercio.csv", "sucursales.csv", "productos.csv"}

# Supermarket commerces only: the archive and the API also carry fuel-station shops (Axion, Deheza, Estación Lima) and appliance chains.
SUPERMARKETS = {"2", "5", "6", "8", "9", "10", "11", "12", "13", "15", "20", "21", "47"}

# A commerce whose file footer is older than this, relative to the newest footer in the archive, is left out.
STALE_DAYS = 30

# Chains whose descriptions are complete enough to show, best first. DIA, Toledo and Coop. Obrera truncate at 20 to 25 characters.
NAME_PREFERENCE = ["12", "10", "2", "9", "11", "8", "5", "6", "20", "47", "13", "21", "15"]

JUNK_BRANDS = {"", "SINMARCA", "SD", "GENERICO", "VARIOS", "ELABORACIONPROPIA", "NN"}

# Search index: products in this many chains, or one fewer when they belong to a basket category.
SEARCH_MIN_CHAINS = 5

# Branches answering each location: the nearest few of every chain banner within the radius. The API accepts 50 branches per request.
BRANCH_RADIUS_KM = 30
BRANCHES_PER_BANNER = 2
MAX_BRANCHES_PER_REQUEST = 50

# Commerces in the archive that the live Precios Claros API does not serve (checked 2026-10-30: Carrefour has no branches there).
# They are left out of the live branch lists so they take no request slot, and still count for the archive's fresh prices.
NOT_IN_LIVE_API = {"10"}

# Must match MAX_PRICE_FAVORITES in app/lib/prices.ts.
MAX_FAVORITES = 8

# Reference-basket categories priced live by a single GTIN. Patterns run on normalized text (upper case, no accents or punctuation, padded with spaces).
PRODUCT_CATEGORIES = {
    "leche-entera": ("Almacén", "Leche entera", r" LECHE .*ENT", r" POLVO | CHOCO| CONDENS| DULCE | ALMENDRA| COCO | DESLAC| CEREAL| GALL| CAFE | FERM| ACTIMEL| GATO| GATIT"),
    "yogur": ("Almacén", "Yogur", r" YOG", r" GALL| CEREAL| HELADO| BARRA| ALFAJ"),
    "manteca": ("Almacén", "Manteca", r" MANTECA ", r" CACAO| MANI | GALL| LIGHT| CORPORAL| CREMA CORP| LACTOSA"),
    "queso-crema": ("Almacén", "Queso crema", r" QUESO .*(CREMA|UNTABLE)", r" RALLADO| SNACK| GALL| JAMON| SALAME| CHEDDAR"),
    "dulce-de-leche": ("Almacén", "Dulce de leche", r" DULCE (DE|D) LECHE ", r" GALL| ALFAJ| HELADO| OBLEA| CAPP| BIZC| BUDIN| TORTA| YOG| LICOR| CHOCO| BOCAD"),
    "harina": ("Almacén", "Harina de trigo", r" HARINA .*(000|0000| TRIGO)", r" PREMEZCLA| PIZZA| LEUDANTE| INTEGRAL"),
    "arroz": ("Almacén", "Arroz", r" ARROZ (LARGO|DOBLE|GRANO|PARBOIL|INTEGRAL|FINO|CAROLINA|BLANCO)", r" GALL| TOSTAD| SNACK| CON | LECHE | PREPAR| RISOTTO| HARINA| BARR| CEREAL| GATO| PERRO| DISCOS| ARITOS"),
    "fideos": ("Almacén", "Fideos secos", r" FIDEO| SPAGHETTI| TALLARIN| MOSTACHOL| TIRABUZ", r" SOPA| INSTANT| VASO| CUP | ARROZ "),
    "aceite-girasol": ("Almacén", "Aceite de girasol", r" ACEITE .*GIRASOL", r" AEROSOL| SPRAY| OLIVA| MEZCLA"),
    "azucar": ("Almacén", "Azúcar", r" AZUCAR (COMUN|REFINAD|BLANC|TIPO|CLASIC|SUPERIOR|LEDESMA|CHANGO|DOMINO|AZUCEL|BELLA|ORGANIC|MASCABO)", r" SIN AZUCAR| 0 AZUCAR| CERO AZUCAR| MENOS AZUCAR| LIGHT| GALL| CHOCO| CARAMEL| IMPALPABLE| ALGOD| BIZC| GASEOSA| CEREAL| CACAO| CHICLE| CAFE| NESTUM| DULCE"),
    "sal": ("Almacén", "Sal", r" SAL (FINA|GRUESA|ENTREFINA)", r" HIERBAS| LIGHT| PARRILLERA| AJO "),
    "yerba": ("Almacén", "Yerba mate", r" YERBA ", r" MATE COCIDO| SAQUITO| TE | NARANJA| LIMON| MENTA| HIERBAS| SABOR| ADELGA"),
    "cafe": ("Almacén", "Café", r" CAFE ", r" CAPP| LATTE| GALL| CHOCO| LICOR| CAPSUL| HELADO| YOG| CERA | CALZADO"),
    "te": ("Almacén", "Té", r" TE .*(SAQ|NEGRO|COMUN|CLASICO)", r" HELADO| VERDE| FRUT| MANZANILLA| BOLDO| DURAZNO| LIMON"),
    "pure-tomate": ("Almacén", "Puré de tomate", r" (PURE|TRITURADO|PULPA) .*TOMATE| TOMATE .*(PURE|TRITURADO|PULPA)", r" KETCHUP| SALSA"),
    "galletitas-agua": ("Almacén", "Galletitas de agua", r" GALL.* (AGUA|CRACKER)| CRIOLLITAS ", r" DULC| CHOCO| RELLEN| PIZZA| SESAMO"),
    "galletitas-dulces": ("Almacén", "Galletitas dulces", r" GALL.*(DULC|VAINILLA|CHOCO|RELLEN)| OREO | CHOCOLINAS ", r""),
    "gaseosa-cola": ("Almacén", "Gaseosa cola", r" COLA ", r" ZERO| LIGHT| SIN AZ| CERO| GALL| LATA| COMBO| 354| 220| 237| 500"),
    "agua-mineral": ("Almacén", "Agua mineral", r" AGUA .*(MINERAL|S GAS|SIN GAS)", r" SABOR| MICELAR| OXIGEN| COLONIA| PERF| TONICA| MANZANA| POMELO| LIMON"),
    "detergente": ("Limpieza e higiene", "Detergente", r" DETERG.*(LIQ|VAJ)| LAVAVAJ", r" ROPA| POLVO| MAQUINA| PASTILLA"),
    "jabon-ropa": ("Limpieza e higiene", "Jabón para ropa", r" (JABON|DETERG).*(POLVO|ROPA|LIQ.*ROPA)", r" TOCADOR| GLICER| VAJ| BEBE| FINA"),
    "lavandina": ("Limpieza e higiene", "Lavandina", r" LAVANDINA ", r" GEL | ROPA COLOR"),
    "papel-higienico": ("Limpieza e higiene", "Papel higiénico", r" (PAPEL|P) HIG", r""),
    "pasta-dental": ("Limpieza e higiene", "Pasta dental", r" (PASTA|CREMA) DENT", r" CEPILLO"),
    "jabon-tocador": ("Limpieza e higiene", "Jabón de tocador", r" JABON .*(TOCADOR|BARRA)| JAB TOC", r" LIQ| ROPA"),
    "shampoo": ("Limpieza e higiene", "Shampoo", r" SHAMPOO ", r" PERRO| GATO| MASC| SECO"),
}

# Staples priced live as a group: each chain sells its own barcoded version, compared per `unit`.
GROUP_CATEGORIES = {
    "huevos": ("Almacén", "Huevos blancos", "docena", r" HUEVO", r" KINDER| CHOCO| PASCUA| CORTADOR| FIDEO| PASTA| LASAGN| LICOR| FLAN| TALLARIN| CODORNIZ| POLVO| LIQUID| SORPRESA| MAYON| ORG | ORGANIZ| SPAGUETTI| CINTA"),
    "pan-lactal": ("Almacén", "Pan lactal blanco", "kg", r" PAN .*(LACT|MOLDE|MESA)| LACTAL ", r" RALLADO| HAMB| PANCHO| DULCE | TOSTAD| MANTECA| SALVADO| INTEGRAL| SEMILLA| MULTICER| SIN TACC| PROTEI| CHIA| PAPA "),
}

# Fresh food sold under weighed in-store codes, which the live API never returns. Priced from the archive per kg.
FRESH_CATEGORIES = {
    "pan-frances": ("Frescos", "Pan francés", ("PAN", "FLAUTA"), r" PAN (FRANCES|FLAUTA)| FLAUTA ", r" FLAUTITA| RALLADO| CONGEL"),
    "carne-picada": ("Frescos", "Carne picada", ("PICAD",), r" CARNE PICADA| PICADA (COMUN|ESPECIAL|DE NALGA|ECONOMICA|VACUNA|MAGRA|PREMIUM)", r" POLLO| CERDO| SOJA| VEGET| HAMB| MEDALLON| GOURMET| SALAM| QUESO| AJO | PEREJIL"),
    "asado": ("Frescos", "Asado", ("ASADO",), r" ASADO ", r" TAPA | SNACK| PAPAS| DISCOS| ARROZ| MAYONESA| PLATO| CUCHILL| JGO | JUEGO| CONDIM| SALSA| CARBON| PARRILLA| ADEREZO| SABOR| LAYS| QUENTO| JULICROC| CRIOLLO| P ASADO"),
    "pollo": ("Frescos", "Pollo entero", ("POLLO",), r" POLLO (ENTERO|FRESCO)", r" SAZON| CALDO| ALIMENTO| SABOR| GATO| PERRO| NUGGET| HAMB| SUPREMA| BOCADITO| PATA| ALA | PECHUGA| MUSLO| CRUJIENT| TIRITA"),
    "papa": ("Frescos", "Papa", ("PAPA",), r" PAPAS? (X KG|KG|NEGRA|BLANCA|CEPILLADA|LAVADA|GRANEL|COMERCIAL|SELECCION)", r" FRITA| CHIPS| PURE| SNACK| PALITO| NOISET| CONGEL| BASTON| LAYS| NOQUI| HAMB| DULCE"),
    "cebolla": ("Frescos", "Cebolla", ("CEBOLLA",), r" CEBOLLA (X KG|KG|GRANEL|COMERCIAL|SUELTA|ELEG|BLANCA|COMUN|BOLSITA)| CEBOLLA$", r" DESHID| POLVO| SOPA| SNACK| CHIPS| SALSA| SABOR| APERIT| CARAMEL| QUESO| VERDEO| MORADA| CONGEL"),
    "tomate": ("Frescos", "Tomate", ("TOMATE",), r" TOMATE (REDONDO|X KG|KG|GRANEL|FRESCO|PERITA ELEG|PERITA X KG|PERITA KG|PERITA 1 KG|PERITA$)", r" PURE| TRITUR| PULPA| SALSA| SECO| LATA| PELADO| ENTERO| CUBET| DESEC| CHERRY"),
    "banana": ("Frescos", "Banana", ("BANANA",), r" BANANA (X KG|KG|GRANEL|ECUADOR|DE ECUADOR|CAVENDISH|NOA|BRASIL)", r" CHIPS| YOG| JUGO| GALL| SABOR| MERMEL| DULCE| TOSTON"),
    "manzana": ("Frescos", "Manzana", ("MANZANA",), r" MANZANA (ROJA|VERDE|DELICIOUS|GRANNY|GALA|X KG|KG|GRANEL)", r" JUGO| SIDRA| SHAMPOO| SABOR| ACOND| GALL| JABON| VODKA| SMIRNOFF| AGUA | POLVO| SNACK| BARRA| DESH"),
}

# Bounds around the national median that drop absurd per-kg prices (DIA lists one potato at $95).
FRESH_PRICE_BOUNDS = (0.33, 3.0)

UNITS = {
    "G": ("g", 1), "GR": ("g", 1), "GRS": ("g", 1), "GRM": ("g", 1), "GRAMOS": ("g", 1),
    "KG": ("g", 1000), "KGS": ("g", 1000), "KGM": ("g", 1000), "KGR": ("g", 1000), "KILO": ("g", 1000),
    "ML": ("ml", 1), "CC": ("ml", 1), "CM3": ("ml", 1), "CMQ": ("ml", 1), "MLT": ("ml", 1),
    "L": ("ml", 1000), "LT": ("ml", 1000), "LTS": ("ml", 1000), "LTR": ("ml", 1000), "LITRO": ("ml", 1000), "LITROS": ("ml", 1000),
    "UN": ("u", 1), "UNI": ("u", 1), "UNIDAD": ("u", 1), "UNIDA": ("u", 1), "UD": ("u", 1), "EA": ("u", 1), "U": ("u", 1), "CU": ("u", 1),
}


def norm(text: str) -> str:
    """Upper case, no accents or punctuation, single spaces, padded with one space on each side for word-boundary patterns."""

    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))

    return " " + " ".join(re.sub(r"[^A-Za-z0-9]+", " ", text).upper().split()) + " "


def squash(text: str) -> str:
    return norm(text).replace(" ", "")


def canonical_gtin(raw: str) -> str | None:
    """The 13-digit zero-padded GTIN the live API uses, or None for in-store, short or invalid codes."""

    digits = raw.strip().lstrip("0")

    if not digits.isdigit() or not 8 <= len(digits) <= 14:
        return None

    padded = digits.zfill(14)
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(padded[:13]))

    if (10 - total % 10) % 10 != int(padded[13]):
        return None

    # GS1 restricted-circulation numbers (in-store and variable-weight codes).
    if len(digits) == 13 and digits[0] == "2":
        return None

    return digits.zfill(13) if len(digits) <= 13 else digits


def measure(quantity: str, unit: str) -> tuple[str, float] | None:
    """A (base unit, amount) pair such as ("g", 500.0) from a quantity and a unit as each chain spells it."""

    key = re.sub(r"^PRECIOX\d*", "", squash(unit))

    try:
        value = float(quantity)
    except ValueError:
        return None

    if key not in UNITS or value <= 0:
        return None

    base, factor = UNITS[key]

    return base, round(value * factor, 3)


def weight_in_text(text: str) -> float | None:
    """Kilograms stated in a normalized description: "X KG", "1 KG", "X 500 GRS". None when absent."""

    match = re.search(r" (?:X )?(\d+(?:[ .,]\d+)?) ?(KG|KGS|KGM|KILO|GR|GRS|GRM|G) ", text)

    if match:
        amount = float(match.group(1).replace(" ", ".").replace(",", "."))

        return amount if match.group(2).startswith("K") else amount / 1000

    if re.search(r" (X |POR )?(KG|KILO) ", text):
        return 1.0

    return None


def footer_date(archive: zipfile.ZipFile) -> dt.date | None:
    """The `Última actualización` footer date of comercio.csv; its comercio_ultima_actualizacion column can be years stale while the footer is current."""

    last = ""

    # Streamed line by line so memory stays constant whatever size the entry declares.
    with archive.open("comercio.csv") as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace"):
            if line.strip():
                last = line

    match = re.search(r"(\d{4}-\d{2}-\d{2})", last)

    return dt.date.fromisoformat(match.group(1)) if match else None


def check_archive(archive: zipfile.ZipFile, label: str, max_entries: int, required: set[str] | None = None) -> list[zipfile.ZipInfo]:
    """Rejects an archive with too many entries, oversized or overcompressed members, or missing files, before anything is decompressed.

    CPython's ZipExtFile never returns more than an entry's declared size, so checking the declared sizes bounds the actual output.
    """

    entries = archive.infolist()

    if len(entries) > max_entries:
        raise SystemExit(f"{label}: {len(entries)} entries, more than the {max_entries} allowed.")

    total = 0

    for entry in entries:
        total += entry.file_size

        if entry.file_size > MAX_ENTRY_BYTES:
            raise SystemExit(f"{label}: {entry.filename} declares {entry.file_size} bytes, more than {MAX_ENTRY_BYTES}.")

        if entry.file_size > MAX_COMPRESSION_RATIO * max(entry.compress_size, 1):
            raise SystemExit(f"{label}: {entry.filename} has a compression ratio above {MAX_COMPRESSION_RATIO}.")

    if total > MAX_TOTAL_BYTES:
        raise SystemExit(f"{label}: {total} bytes uncompressed in total, more than {MAX_TOTAL_BYTES}.")

    if required and not required <= {entry.filename for entry in entries}:
        raise SystemExit(f"{label}: missing {sorted(required - {entry.filename for entry in entries})}.")

    return entries


def check_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)

    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise SystemExit(f"Refusing {url}: only HTTPS from {', '.join(sorted(ALLOWED_HOSTS))} is accepted.")

    return url


def read_table(archive: zipfile.ZipFile, name: str):
    """Rows of a |-delimited SEPA table as dicts with stripped values, skipping the footer and malformed lines."""

    with archive.open(name) as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""), delimiter="|")
        header = [column.strip() for column in next(reader)]

        for row in reader:
            if len(row) == len(header):
                yield dict(zip(header, (value.strip() for value in row)))


def compile_categories():
    product = {key: (re.compile(include), re.compile(exclude) if exclude else None) for key, (_, _, include, exclude) in PRODUCT_CATEGORIES.items()}
    group = {key: (re.compile(include), re.compile(exclude)) for key, (_, _, _, include, exclude) in GROUP_CATEGORIES.items()}
    fresh = {key: (keywords, re.compile(include), re.compile(exclude)) for key, (_, _, keywords, include, exclude) in FRESH_CATEGORIES.items()}

    return product, group, fresh


def matches(patterns, text: str) -> bool:
    include, exclude = patterns

    return bool(include.search(text)) and not (exclude and exclude.search(text))


def command_download(args):
    with urllib.request.urlopen(check_url(PACKAGE_URL), timeout=60) as response:
        check_url(response.geturl())
        package = json.load(response)["result"]

    zips = [resource for resource in package["resources"] if resource.get("format") == "ZIP"]
    latest = max(zips, key=lambda resource: resource["last_modified"])
    url = check_url(latest["url"])
    name = Path(urllib.parse.urlsplit(url).path).name

    if not re.fullmatch(r"sepa_[a-z]+\.zip", name):
        raise SystemExit(f"Unexpected archive name {name!r}.")

    target = Path(args.work).expanduser() / name
    target.parent.mkdir(parents=True, exist_ok=True)

    print(f"{latest['name']} ({latest['last_modified']}, {latest['size'] / 1e6:.0f} MB) -> {target}")

    partial = target.with_suffix(".part")
    received = 0

    with urllib.request.urlopen(url, timeout=600) as response, open(partial, "wb") as out:
        check_url(response.geturl())

        while chunk := response.read(1 << 20):
            received += len(chunk)

            if received > MAX_DOWNLOAD_BYTES:
                out.close()
                partial.unlink()

                raise SystemExit(f"Download exceeded {MAX_DOWNLOAD_BYTES} bytes; stopped.")

            out.write(chunk)

    partial.replace(target)


def command_aggregate(args):
    archive_path = Path(args.archive).expanduser()
    work = Path(args.work).expanduser()
    work.mkdir(parents=True, exist_ok=True)
    _, _, fresh_patterns = compile_categories()

    commerces = {}
    branches = {}
    products: dict[str, dict] = {}
    fresh: dict[str, dict[str, list]] = {key: defaultdict(list) for key in FRESH_CATEGORIES}

    with zipfile.ZipFile(archive_path) as outer, tempfile.TemporaryDirectory() as scratch:
        for member in check_archive(outer, archive_path.name, MAX_OUTER_ENTRIES):
            match = re.search(r"comercio-sepa-(\d+)_", member.filename)

            if not match or member.file_size == 0:
                if match:
                    print(f"  commerce {match.group(1)}: empty file, skipped")

                continue

            commerce_id = match.group(1)

            if commerce_id not in SUPERMARKETS:
                continue

            inner_path = Path(scratch) / "inner.zip"

            with outer.open(member) as source, open(inner_path, "wb") as target:
                shutil.copyfileobj(source, target, 1 << 20)

            with zipfile.ZipFile(inner_path) as inner:
                check_archive(inner, member.filename, MAX_INNER_ENTRIES, INNER_FILES)
                banners = {row["id_bandera"]: row["comercio_bandera_nombre"] for row in read_table(inner, "comercio.csv")}
                updated = footer_date(inner)
                commerces[commerce_id] = {"banners": banners, "updated": updated.isoformat() if updated else None}

                for row in read_table(inner, "sucursales.csv"):
                    try:
                        lat, lng = float(row["sucursales_latitud"]), float(row["sucursales_longitud"])
                    except ValueError:
                        continue

                    branch_id = f"{commerce_id}-{row['id_bandera']}-{row['id_sucursal']}"
                    branches[branch_id] = {
                        "commerce": commerce_id,
                        "chain": banners.get(row["id_bandera"], ""),
                        "name": row["sucursales_nombre"],
                        "lat": lat,
                        "lng": lng,
                        "province": row["sucursales_provincia"],
                        "locality": row["sucursales_localidad"],
                    }

                rows = 0

                for row in read_table(inner, "productos.csv"):
                    rows += 1
                    description = " ".join(row["productos_descripcion"].split())
                    branch_id = f"{commerce_id}-{row['id_bandera']}-{row['id_sucursal']}"

                    try:
                        price = float(row["productos_precio_lista"])
                    except ValueError:
                        continue

                    upper = description.upper()

                    for key, (keywords, include, exclude) in fresh_patterns.items():
                        if not any(keyword in upper for keyword in keywords):
                            continue

                        text = norm(description)

                        if not include.search(text) or exclude.search(text):
                            continue

                        size = measure(row["productos_cantidad_presentacion"], row["productos_unidad_medida_presentacion"])
                        kilograms = size[1] / 1000 if size and size[0] == "g" else weight_in_text(text)

                        if kilograms:
                            fresh[key][branch_id].append([description, round(price / kilograms, 2)])

                        break

                    if row["productos_ean"] != "1":
                        continue

                    gtin = canonical_gtin(row["id_producto"])

                    if gtin is None:
                        continue

                    per = products.setdefault(gtin, {}).get(commerce_id)

                    if per is None:
                        per = products[gtin][commerce_id] = {"desc": Counter(), "brand": Counter(), "size": Counter(), "ref": Counter(), "prices": defaultdict(list)}

                    per["desc"][description] += 1
                    per["brand"][" ".join(row["productos_marca"].split())] += 1
                    per["size"][f"{row['productos_cantidad_presentacion']}|{row['productos_unidad_medida_presentacion']}"] += 1
                    per["ref"][f"{row['productos_cantidad_referencia']}|{row['productos_unidad_medida_referencia']}"] += 1
                    per["prices"][row["id_bandera"]].append(price)

            print(f"  commerce {commerce_id} ({' / '.join(banners.values())}): {rows} rows, updated {commerces[commerce_id]['updated']}")

    newest = max(dt.date.fromisoformat(c["updated"]) for c in commerces.values() if c["updated"])

    for commerce_id, commerce in commerces.items():
        commerce["stale"] = not commerce["updated"] or (newest - dt.date.fromisoformat(commerce["updated"])).days > STALE_DAYS

        if commerce["stale"]:
            print(f"  commerce {commerce_id}: last updated {commerce['updated']}, left out as stale")

    slim = {}

    for gtin, by_commerce in products.items():
        slim[gtin] = {}

        for commerce_id, per in by_commerce.items():
            prices = [price for by_banner in per["prices"].values() for price in by_banner]

            slim[gtin][commerce_id] = {
                "desc": per["desc"].most_common(1)[0][0],
                "brand": per["brand"].most_common(1)[0][0],
                "size": per["size"].most_common(1)[0][0],
                "ref": per["ref"].most_common(1)[0][0],
                "branches": len(prices),
                "median": statistics.median(prices),
                "banners": {banner_id: statistics.median(by_banner) for banner_id, by_banner in per["prices"].items()},
            }

    out = {"source_date": newest.isoformat(), "archive": archive_path.name, "commerces": commerces, "branches": branches, "products": slim, "fresh": fresh}

    with gzip.open(work / "aggregate.json.gz", "wt", encoding="utf-8") as target:
        json.dump(out, target, ensure_ascii=False)

    print(f"{len(slim)} GTINs, {len(branches)} branches, source date {newest} -> {work / 'aggregate.json.gz'}")


def load_aggregate(work: Path) -> dict:
    with gzip.open(work / "aggregate.json.gz", "rt", encoding="utf-8") as source:
        data = json.load(source)

    live = {commerce_id for commerce_id, commerce in data["commerces"].items() if not commerce["stale"]}

    data["products"] = {gtin: {c: p for c, p in by.items() if c in live} for gtin, by in data["products"].items()}
    data["products"] = {gtin: by for gtin, by in data["products"].items() if by}
    data["branches"] = {branch_id: branch for branch_id, branch in data["branches"].items() if branch["commerce"] in live}
    data["fresh"] = {key: {b: rows for b, rows in by.items() if b in data["branches"]} for key, by in data["fresh"].items()}

    return data


def display_name(by_commerce: dict) -> str:
    commerce_id = next(c for c in NAME_PREFERENCE if c in by_commerce)
    name = by_commerce[commerce_id]["desc"]

    # Vea appends a packaging code such as "BSA-460-gr."; Axion prefixes "DISC:".
    return re.sub(r"\s+[A-Z]{3}-[\d.]+-[A-Za-z]+\.?(\s+[A-Z]{3}-[\d.]+-[A-Za-z]+\.?)*$", "", name).strip()


def best_brand(by_commerce: dict) -> str | None:
    """The brand most chains agree on after normalization; a truncated spelling folds into the longer one it prefixes."""

    votes: Counter = Counter()
    spelling: dict[str, Counter] = defaultdict(Counter)

    for per in by_commerce.values():
        key = squash(per["brand"])

        if key in JUNK_BRANDS or key.isdigit() or re.fullmatch(r"\d+(UD|UN|U)", key):
            continue

        votes[key] += 1
        spelling[key][per["brand"]] += 1

    for short in list(votes):
        longer = [key for key in votes if key != short and key.startswith(short)]

        if longer:
            target = max(longer, key=votes.__getitem__)
            votes[target] += votes.pop(short)

    if not votes:
        return None

    winner = votes.most_common(1)[0][0]

    return spelling[winner].most_common(1)[0][0] if spelling[winner] else winner


def best_size(by_commerce: dict) -> tuple[str, float] | None:
    """The size most chains agree on. Carrefour reports "1 UNI" and states the real size in its reference columns."""

    votes: Counter = Counter()

    for per in by_commerce.values():
        size = measure(*per["size"].split("|", 1))

        if size == ("u", 1.0):
            size = measure(*per["ref"].split("|", 1)) or size

        if size:
            votes[size] += 1

    return votes.most_common(1)[0][0] if votes else None


def format_size(size: tuple[str, float] | None) -> str:
    if not size:
        return ""

    base, amount = size

    if base == "g" and amount >= 1000:
        return f"{amount / 1000:g} kg"

    if base == "ml" and amount >= 1000:
        return f"{amount / 1000:g} l"

    return f"{amount:g} {base}"


def count_in_text(text: str) -> int | None:
    match = re.search(r" X ?(\d+) ?(U|UN|UNI|UD|UNIDADES)? | (\d+) ?(U|UN|UNI|UD|UNIDADES) | MAPLE X? ?(\d+)", text)

    if match:
        return int(next(group for group in match.groups() if group and group.isdigit()))

    if " DOCENA " in text:
        return 6 if " 1 2 DOCENA " in text or " MEDIA DOCENA " in text else 12

    return None


def command_candidates(args):
    work = Path(args.work).expanduser()
    data = load_aggregate(work)
    product_patterns, group_patterns, _ = compile_categories()
    chain_names = {c: " / ".join(v["banners"].values()) for c, v in data["commerces"].items()}
    texts = {gtin: " ".join(norm(per["desc"]) for per in by.values()) for gtin, by in data["products"].items()}

    lines = [f"# Candidatos para la canasta de referencia", "", f"Archivo {data['archive']}, datos del {data['source_date']}.", ""]

    for key, (section, label, *_rest) in PRODUCT_CATEGORIES.items():
        hits = sorted(
            (gtin for gtin, text in texts.items() if matches(product_patterns[key], text)),
            key=lambda gtin: (-len(data["products"][gtin]), -sum(p["branches"] for p in data["products"][gtin].values())),
        )

        lines += [f"## {section} · {label} (`{key}`)", "", "| GTIN | Cadenas | Nombre | Marca | Tamaño | Mediana |", "|---|---|---|---|---|---|"]

        for gtin in hits[: args.limit]:
            by = data["products"][gtin]
            median = statistics.median(p["median"] for p in by.values())
            lines.append(f"| {gtin} | {len(by)} | {display_name(by)} | {best_brand(by) or ''} | {format_size(best_size(by))} | ${median:,.0f} |")

        lines.append("")

    for key, (section, label, unit, *_rest) in GROUP_CATEGORIES.items():
        lines += [f"## {section} · {label}, por {unit} (`{key}`, grupo)", "", "| Cadena | GTIN | Nombre | Tamaño | Mediana | Por " + unit + " |", "|---|---|---|---|---|---|"]

        for commerce_id, chain in sorted(chain_names.items(), key=lambda item: item[1]):
            rows = []

            for gtin, by in data["products"].items():
                per = by.get(commerce_id)

                if not per or not matches(group_patterns[key], norm(per["desc"])):
                    continue

                text = norm(per["desc"])

                if key == "huevos":
                    if " COLOR" in text or " CASTA" in text or " CAMPO " in text or " LIBRE" in text:
                        continue

                    count = count_in_text(text) or (int(m[1]) if (m := measure(*per["size"].split("|", 1))) and m[0] == "u" and m[1] > 1 else None)
                    normalized = per["median"] / count * 12 if count else None
                    size = f"{count} u" if count else ""
                else:
                    size_pair = best_size({commerce_id: per})
                    kilograms = size_pair[1] / 1000 if size_pair and size_pair[0] == "g" and size_pair[1] > 50 else weight_in_text(text)
                    normalized = per["median"] / kilograms if kilograms else None
                    size = f"{kilograms * 1000:g} g" if kilograms else ""

                rows.append((per["branches"], gtin, per["desc"], size, per["median"], normalized))

            for branches, gtin, description, size, median, normalized in sorted(rows, reverse=True)[:4]:
                lines.append(f"| {chain} | {gtin} | {description} | {size} | ${median:,.0f} | {f'${normalized:,.0f}' if normalized else 's/d'} |")

        lines.append("")

    for key, (section, label, *_rest) in FRESH_CATEGORIES.items():
        per_kg = [price for rows in data["fresh"][key].values() for _, price in rows]
        national = statistics.median(per_kg) if per_kg else None
        lines += [f"## {section} · {label}, por kg (`{key}`, archivo)", "", f"Mediana nacional ${national:,.0f}/kg sobre {len(per_kg)} precios." if national else "Sin datos.", ""]
        lines += ["| Cadena | Sucursales | Mediana por kg | Descripciones |", "|---|---|---|---|"]

        by_chain: dict[str, list] = defaultdict(list)

        for branch_id, rows in data["fresh"][key].items():
            for description, price in rows:
                by_chain[data["branches"][branch_id]["commerce"]].append((branch_id, description, price))

        for commerce_id, rows in sorted(by_chain.items(), key=lambda item: chain_names.get(item[0], "")):
            low, high = (national * FRESH_PRICE_BOUNDS[0], national * FRESH_PRICE_BOUNDS[1]) if national else (0, float("inf"))
            kept = [row for row in rows if low <= row[2] <= high]
            descriptions = Counter(description for _, description, _ in kept).most_common(3)
            median = f"${statistics.median(row[2] for row in kept):,.0f}" if kept else "s/d"
            lines.append(f"| {chain_names[commerce_id]} | {len({row[0] for row in kept})} | {median} | {'; '.join(d for d, _ in descriptions)} |")

        lines.append("")

    target = work / "candidates.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {target}")


def read_locations() -> list[dict]:
    """PRICE_LOCATIONS from app/lib/prices.ts, which stays the single source for the location picker."""

    source = (REPO / "app/lib/prices.ts").read_text(encoding="utf-8")
    block = re.search(r"PRICE_LOCATIONS[^=]*=\s*\[(.*?)\];", source, re.S)

    if not block:
        raise SystemExit("PRICE_LOCATIONS not found in app/lib/prices.ts.")

    pattern = r'\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+),?\s*\}'
    locations = [{"id": m[0], "label": m[1], "lat": float(m[2]), "lng": float(m[3])} for m in re.findall(pattern, block.group(1))]

    if len(locations) != block.group(1).count("id:"):
        raise SystemExit("Could not parse every PRICE_LOCATIONS entry; keep each as { id, label, lat, lng }.")

    return locations


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2

    return 6371 * 2 * math.asin(math.sqrt(a))


def nearby_branches(location: dict, branches: dict) -> list[str]:
    """The nearest BRANCHES_PER_BANNER branches of every chain banner within BRANCH_RADIUS_KM, nearest first, capped at the API's limit."""

    by_banner: dict[str, list] = defaultdict(list)

    for branch_id, branch in branches.items():
        km = distance_km(location["lat"], location["lng"], branch["lat"], branch["lng"])

        if km <= BRANCH_RADIUS_KM:
            by_banner[branch_id.rsplit("-", 1)[0]].append((km, branch_id))

    chosen = sorted(entry for entries in by_banner.values() for entry in sorted(entries)[:BRANCHES_PER_BANNER])

    return [branch_id for _, branch_id in chosen[:MAX_BRANCHES_PER_REQUEST]]


def clean_product_name(name: str) -> str:
    """Turn an upper-case archive description into a readable product name.

    The raw words stay searchable through the aliases column, so this only
    needs to fix the casing of the name shown in the search results.
    """
 
    return " ".join(
        token
        if any(char.isdigit() for char in token) or not any(char.isalpha() for char in token)
        else token.capitalize()
        for token in name.split()
    )
 
 
def search_row(gtin: str, by_commerce: dict) -> list:
    name = clean_product_name(display_name(by_commerce))
    brand = best_brand(by_commerce)
    own = set(norm(name).split()) | set(norm(brand or "").split())
    aliases = sorted({token for per in by_commerce.values() for token in norm(per["desc"]).split() if len(token) > 2 and not token.isdigit()} - own)
 
    return [gtin, name, brand, format_size(best_size(by_commerce)) or None, " ".join(aliases)]


def archive_fallback(products: dict, gtins: set[str], branch_lists: dict[str, list[str]]) -> dict:
    """Median list price per `commerce-banner` for the basket GTINs, and the banners with a live branch near each location.

    The app shows these when the live API fails. Commerces the live API does not serve (Carrefour) never appear in `branch_lists`, so they never appear here either.
    """
    prices = {}

    for gtin in sorted(gtins):
        by_banner = {
            f"{commerce_id}-{banner_id}": round(median)
            for commerce_id, per in products[gtin].items()
            for banner_id, median in per["banners"].items()
        }

        prices[gtin] = dict(sorted(by_banner.items()))

    banners = {location_id: sorted({branch_id.rsplit("-", 1)[0] for branch_id in branch_ids}) for location_id, branch_ids in branch_lists.items()}

    return {"banners": banners, "prices": prices}


def command_build(args):
    work = Path(args.work).expanduser()
    data = load_aggregate(work)
    selection = json.loads((REPO / "scripts/price-basket.json").read_text(encoding="utf-8"))
    locations = read_locations()
    products = data["products"]

    if any("banners" not in per for by in products.values() for per in by.values()):
        raise SystemExit("aggregate.json.gz predates per-banner prices; rerun the aggregate command on the archive.")

    categories = selection["categories"]
    ids = {category["id"] for category in categories}
    errors = []

    for category in categories:
        if category["kind"] == "product" and category["gtin"] not in products:
            errors.append(f"{category['id']}: GTIN {category['gtin']} is not in the archive.")

        if category["kind"] == "group":
            errors += [f"{category['id']}: member {m['gtin']} is not in the archive." for m in category["members"] if m["gtin"] not in products]

        if category["kind"] == "fresh" and category["id"] not in FRESH_CATEGORIES:
            errors.append(f"{category['id']}: no FRESH_CATEGORIES pattern.")

    gtins = {category["gtin"] for category in categories if category["kind"] == "product"}
    errors += [f"default {d} is neither a basket GTIN nor a category id." for d in selection["defaults"] if d not in gtins and d not in ids]

    if len(selection["defaults"]) > MAX_FAVORITES:
        errors.append(f"{len(selection['defaults'])} defaults, more than the {MAX_FAVORITES} favorites allowed.")

    if errors:
        raise SystemExit("\n".join(errors))

    # Branches per location, and fresh prices as the median per chain banner over those branches.
    branch_lists = {}
    fresh = {}
    national = {}

    for key, by_branch in data["fresh"].items():
        prices = [price for rows in by_branch.values() for _, price in rows]
        national[key] = statistics.median(prices) if prices else None

    live_branches = {branch_id: branch for branch_id, branch in data["branches"].items() if branch["commerce"] not in NOT_IN_LIVE_API}

    for location in locations:
        chosen = nearby_branches(location, data["branches"])
        branch_lists[location["id"]] = nearby_branches(location, live_branches)
        fresh[location["id"]] = {}

        for category in (c for c in categories if c["kind"] == "fresh"):
            median = national[category["id"]]

            if median is None:
                continue

            low, high = median * FRESH_PRICE_BOUNDS[0], median * FRESH_PRICE_BOUNDS[1]
            by_chain: dict[str, list] = defaultdict(list)

            # Keyed by "commerce-banner" so the app labels these exactly as it labels live quotes.
            for branch_id in chosen:
                for _, price in data["fresh"][category["id"]].get(branch_id, []):
                    if low <= price <= high:
                        by_chain[branch_id.rsplit("-", 1)[0]].append(price)

            fresh[location["id"]][category["id"]] = sorted(
                ({"banner": banner, "price": round(statistics.median(prices))} for banner, prices in by_chain.items()),
                key=lambda entry: (entry["price"], entry["banner"]),
            )

        live = branch_lists[location["id"]]
        chains = {data["branches"][b]["chain"] for b in live}
        print(f"  {location['id']:22} {len(live):>2} live branches, {len(chains):>2} banners; {len(chosen) - len(live)} archive-only")

    groups = {
        category["id"]: {
            "unit": category["unit"],
            "members": [{"gtin": m["gtin"], "per": m["per"], "commerces": sorted(products[m["gtin"]], key=int)} for m in category["members"]],
        }
        for category in categories
        if category["kind"] == "group"
    }

    # Search index: widely carried products, one chain fewer for basket categories, and every basket product and group member.
    product_patterns, group_patterns, _ = compile_categories()
    basket_patterns = list(product_patterns.values()) + list(group_patterns.values())
    forced = gtins | {m["gtin"] for category in categories if category["kind"] == "group" for m in category["members"]}
    curated = {category["gtin"]: category["name"] for category in categories if category["kind"] == "product"}
    rows = []

    for gtin, by in products.items():
        chains = len(by)

        if gtin not in forced and chains < SEARCH_MIN_CHAINS - 1:
            continue

        if gtin not in forced and chains < SEARCH_MIN_CHAINS:
            text = " ".join(norm(per["desc"]) for per in by.values())

            if not any(matches(patterns, text) for patterns in basket_patterns):
                continue

        row = search_row(gtin, by)

        if gtin in curated:
            row[1] = curated[gtin]

        rows.append((chains, row))

    rows.sort(key=lambda item: (-item[0], item[1][1]))
    source_date = data["source_date"]
    index_name = f"catalogo-{source_date}.json"
    index_dir = REPO / "public/precios"
    index_dir.mkdir(parents=True, exist_ok=True)

    for old in index_dir.glob("catalogo-*.json"):
        old.unlink()

    index_bytes = json.dumps({"sourceDate": source_date, "products": [row for _, row in rows]}, ensure_ascii=False, separators=(",", ":")).encode()
    (index_dir / index_name).write_bytes(index_bytes)

    client = {
        "generatedBy": "scripts/build-price-basket.py",
        "archive": data["archive"],
        "sourceDate": source_date,
        "searchIndex": f"/precios/{index_name}",
        "defaults": selection["defaults"],
        "categories": [{key: value for key, value in category.items() if key in ("id", "section", "kind", "name", "unit", "gtin")} for category in categories],
    }

    server = {"generatedBy": "scripts/build-price-basket.py", "sourceDate": source_date, "branches": branch_lists, "groups": groups, "fresh": fresh, "archive": archive_fallback(products, forced, branch_lists)}

    (REPO / "app/lib/price-basket.generated.json").write_text(json.dumps(client, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (REPO / "app/lib/price-basket-server.generated.json").write_text(json.dumps(server, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"search index: {len(rows)} products, {len(index_bytes) / 1e3:.0f} KB ({len(gzip.compress(index_bytes, 9)) / 1e3:.0f} KB gzipped) -> public/precios/{index_name}")
    print("-> app/lib/price-basket.generated.json, app/lib/price-basket-server.generated.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    download = commands.add_parser("download", help="Download the newest weekday archive.")
    download.add_argument("--work", required=True, help="Directory outside the repository for the archive and intermediate files.")

    aggregate = commands.add_parser("aggregate", help="Stream an archive into work/aggregate.json.gz.")
    aggregate.add_argument("--archive", required=True)
    aggregate.add_argument("--work", required=True)

    candidates = commands.add_parser("candidates", help="Write work/candidates.md for choosing the basket.")
    candidates.add_argument("--work", required=True)
    candidates.add_argument("--limit", type=int, default=8)

    build = commands.add_parser("build", help="Write the app's generated files from work/aggregate.json.gz and scripts/price-basket.json.")
    build.add_argument("--work", required=True)

    args = parser.parse_args()
    {"download": command_download, "aggregate": command_aggregate, "candidates": command_candidates, "build": command_build}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
