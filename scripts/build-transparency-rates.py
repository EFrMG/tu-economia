"""Builds the Tasas data from the BCRA Régimen de Transparencia: personal loans and credit cards, per lender.

The BCRA publishes each lender's own figures at https://api.bcra.gob.ar/transparencia/v1.0/ (no key). See docs/transparency-rates.md for the rules and the refresh routine.
The Worker cannot parse and validate the 1.7 MB personal-loan list within the Free plan's 10 ms of CPU, so this script does it ahead of time and writes a reduced file the server imports.

Only the standard library is used. Run with `python3 -I` (3.11+); the responses are untrusted input and are only parsed.

    python3 -I scripts/build-transparency-rates.py
    python3 -I scripts/build-transparency-rates.py --input-dir ~/transparencia   # reads saved PrestamosPersonales.json and TarjetasCredito.json instead of calling the API
"""

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Literal, overload

REPO = Path(__file__).resolve().parent.parent
OUTPUT = REPO / "app/lib/transparency-rates.generated.json"

API_BASE = "https://api.bcra.gob.ar/transparencia/v1.0/"
ENDPOINTS = {"loans": "Prestamos/Personales", "cards": "TarjetasCredito"}
INPUT_FILES = {"loans": "PrestamosPersonales.json", "cards": "TarjetasCredito.json"}

ALLOWED_HOSTS = {"api.bcra.gob.ar"}
MAX_RESPONSE_BYTES = 20_000_000

ARGENTINA = dt.timezone(dt.timedelta(hours=-3))

# A product reported more than this many calendar months before the build is left out.
MAX_AGE_MONTHS = 12

# Rows with a rate at or below zero, or above this percentage, are left out. Zero is a reporting gap; non-bank short-term credit reaches about 5,000 %, and the few rows far above that (45,839 %) are reporting errors.
MAX_RATE = 10000.0

# Card fees reported as these values are placeholders for "not informed", not prices.
FEE_PLACEHOLDERS = {999999.0, 999999.99}

# A build that keeps fewer products than this is refused, so a broken response never replaces the committed file.
MIN_LOANS = 200
MIN_CARDS = 50

# The 24 jurisdictions in the order of the personal-loan `territorioValidez` codes (1 to 24; 0 is the whole country).
# The code list is not documented: it is alphabetical with "Ch" after "C", and was checked on 2026-11-12 against the province names the
# credit-card endpoint reports for the same lenders (24 of 29 lenders with both identical, the rest overlapping).
PROVINCES = [
    ("caba", "Ciudad Autónoma de Buenos Aires"),
    ("buenos-aires", "Buenos Aires"),
    ("catamarca", "Catamarca"),
    ("cordoba", "Córdoba"),
    ("corrientes", "Corrientes"),
    ("chaco", "Chaco"),
    ("chubut", "Chubut"),
    ("entre-rios", "Entre Ríos"),
    ("formosa", "Formosa"),
    ("jujuy", "Jujuy"),
    ("la-pampa", "La Pampa"),
    ("la-rioja", "La Rioja"),
    ("mendoza", "Mendoza"),
    ("misiones", "Misiones"),
    ("neuquen", "Neuquén"),
    ("rio-negro", "Río Negro"),
    ("salta", "Salta"),
    ("san-juan", "San Juan"),
    ("san-luis", "San Luis"),
    ("santa-cruz", "Santa Cruz"),
    ("santa-fe", "Santa Fe"),
    ("santiago-del-estero", "Santiago del Estero"),
    ("tierra-del-fuego", "Tierra del Fuego"),
    ("tucuman", "Tucumán"),
]

NATIONWIDE = "todo el territorio nacional"

# Must match LOAN_BENEFICIARIES in app/lib/transparency-rates.ts.
BENEFICIARIES = {
    "todos los beneficiarios": "todos",
    "personas humanas en relacion de dependencia": "relacion-de-dependencia",
    "personas humanas monotributistas": "monotributistas",
    "personas humanas responsables inscriptos": "responsables-inscriptos",
    "empleados publicos": "empleados-publicos",
    "beneficiarios de cuentas de la seguridad social": "seguridad-social",
    "clientes con cuenta en la entidad": "clientes",
    "clientes que acrediten sueldos en la entidad": "clientes-con-sueldo",
}

# Must match CARD_SEGMENTS in app/lib/transparency-rates.ts. The manual lists "Premium black" and "Premium signature"; the endpoint serves one combined value.
SEGMENTS = {
    "nacional": "nacional",
    "internacional": "internacional",
    "premium gold": "gold",
    "premium platinum": "platinum",
    "premium signature, black o similar": "signature-black",
    "premium black": "signature-black",
    "premium signature": "signature-black",
}

RATE_TYPES = {"fija": "fija", "variable": "variable", "mixta": "mixta"}


def fold(text: str) -> str:
    """Lower case, no accents, single spaces: the BCRA spells "Dólares" both with and without the accent."""

    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))

    return re.sub(r"\s+", " ", text).strip().lower()


PROVINCE_BY_NAME = {fold(name): slug for slug, name in PROVINCES}


class InvalidRow(ValueError):
    pass


@overload
def text(row: dict, key: str, required: Literal[True] = True) -> str: ...
@overload
def text(row: dict, key: str, required: bool) -> str | None: ...
def text(row: dict, key: str, required: bool = True) -> str | None:
    value = row.get(key)

    if value is None and not required:
        return None

    if not isinstance(value, str) or not value.strip():
        raise InvalidRow(key)

    return re.sub(r"\s+", " ", value).strip()


@overload
def number(row: dict, key: str, required: Literal[True] = True) -> float: ...
@overload
def number(row: dict, key: str, required: bool) -> float | None: ...
def number(row: dict, key: str, required: bool = True) -> float | None:
    value = row.get(key)

    if value is None and not required:
        return None

    # bool is an int subclass; JSON true/false is never a figure.
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value in (float("inf"), float("-inf")):
        raise InvalidRow(key)

    return float(value)


def integer(row: dict, key: str) -> int:
    value = number(row, key)

    if value != int(value):
        raise InvalidRow(key)

    return int(value)


def report_date(row: dict) -> dt.date:
    value = text(row, "fechaInformacion")

    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError as error:
        raise InvalidRow("fechaInformacion") from error


def months_before(day: dt.date, months: int) -> dt.date:
    """The same calendar day `months` earlier, clamped to the end of a shorter month."""

    year, month = divmod(day.year * 12 + day.month - 1 - months, 12)
    month += 1

    for candidate in range(day.day, 27, -1):
        try:
            return dt.date(year, month, candidate)
        except ValueError:
            continue

    return dt.date(year, month, min(day.day, 28))


def loan_provinces(value: object) -> list[str] | None:
    """`[]` is the whole country; `None` an unknown code."""

    if not isinstance(value, str) or not value.strip().isdigit():
        return None

    code = int(value)

    if code == 0:
        return []

    if 1 <= code <= len(PROVINCES):
        return [PROVINCES[code - 1][0]]

    return None


def card_provinces(value: object) -> list[str] | None:
    if not isinstance(value, str):
        return None

    name = fold(value)

    if name == NATIONWIDE:
        return []

    name = re.sub(r"^provincia (de|del) ", "", name).split(" antartida")[0]

    slug = PROVINCE_BY_NAME.get(name)

    return [slug] if slug else None


def fee(row: dict, key: str) -> float | None:
    value = number(row, key, required=False)

    if value is None or value < 0 or value in FEE_PLACEHOLDERS:
        return None

    return value


def merge_provinces(rows: list[dict]) -> list[dict]:
    """Lenders report one row per province; rows equal in everything else become one row listing them. A nationwide row covers every province."""

    merged: dict[str, dict] = {}

    for row in rows:
        key = json.dumps({k: v for k, v in row.items() if k != "provinces"}, sort_keys=True, ensure_ascii=False)
        existing = merged.get(key)

        if existing is None:
            merged[key] = {**row, "provinces": list(row["provinces"])}
        elif not existing["provinces"] or not row["provinces"]:
            existing["provinces"] = []
        else:
            existing["provinces"] = sorted(set(existing["provinces"]) | set(row["provinces"]), key=[slug for slug, _ in PROVINCES].index)

    return list(merged.values())


def build_loans(results: list, today: dt.date) -> tuple[list[dict], dict]:
    oldest = months_before(today, MAX_AGE_MONTHS)
    excluded: Counter = Counter()
    rows = []

    for raw in results:
        try:
            if not isinstance(raw, dict):
                raise InvalidRow("row")

            currency = text(raw, "denominacion", required=False)

            # Some UVA-adjusted loans are reported as Pesos; their rate is on top of the UVA's, so the product name decides.
            if currency is None or fold(currency) != "pesos" or re.search(r"\bUV[AI]\b", text(raw, "nombreCompleto").upper()):
                excluded["notPesos"] += 1
                continue

            date = report_date(raw)
            tea = number(raw, "tasaEfectivaAnualMaxima")
            cft = number(raw, "costoFinancieroEfectivoTotalMaximo")
            beneficiary = BENEFICIARIES.get(fold(text(raw, "beneficiario")))
            provinces = loan_provinces(raw.get("territorioValidez"))
            rate_type = text(raw, "tipoTasa", required=False)

            if beneficiary is None or provinces is None:
                raise InvalidRow("beneficiario o territorioValidez")

            row = {
                "entityCode": integer(raw, "codigoEntidad"),
                "entity": text(raw, "descripcionEntidad"),
                "product": text(raw, "nombreCompleto"),
                "beneficiary": beneficiary,
                "rateType": RATE_TYPES.get(fold(rate_type)) if rate_type else None,
                "termMonths": integer(raw, "plazoMaximoOtorgable"),
                "amountMin": number(raw, "montoMinimoOtorgable"),
                "amountMax": number(raw, "montoMaximoOtorgable"),
                "incomeMin": number(raw, "ingresoMinimoMensual", required=False),
                "tea": tea,
                "cft": cft,
                "date": date.isoformat(),
                "provinces": provinces,
            }
        except InvalidRow:
            excluded["invalid"] += 1
            continue

        if date < oldest:
            excluded["stale"] += 1
        elif not (0 < tea <= MAX_RATE and 0 < cft <= MAX_RATE):
            excluded["outOfRange"] += 1
        else:
            rows.append(row)

    return merge_provinces(rows), dict(excluded)


def build_cards(results: list, today: dt.date) -> tuple[list[dict], dict]:
    oldest = months_before(today, MAX_AGE_MONTHS)
    excluded: Counter = Counter()
    rows = []

    for raw in results:
        try:
            if not isinstance(raw, dict):
                raise InvalidRow("row")

            date = report_date(raw)
            financing = number(raw, "tasaEfectivaAnualMaximaFinanciacion")
            cash_advance = number(raw, "tasaEfectivaAnualMaximaAdelantoEfectivo", required=False)
            segment = text(raw, "segmento", required=False)
            provinces = card_provinces(raw.get("territorioValidez"))

            if provinces is None:
                raise InvalidRow("territorioValidez")

            row = {
                "entityCode": integer(raw, "codigoEntidad"),
                "entity": text(raw, "descripcionEntidad"),
                "product": text(raw, "nombreCompleto"),
                "segment": SEGMENTS.get(fold(segment)) if segment else None,
                "financingTea": financing,
                # A zero or out-of-range cash-advance rate means the card reports none; the row stays, ranked by its financing rate.
                "cashAdvanceTea": cash_advance if cash_advance is not None and 0 < cash_advance <= MAX_RATE else None,
                "maintenanceFee": fee(raw, "comisionMaximaAdministracionMantenimiento"),
                "renewalFee": fee(raw, "comisionMaximaRenovacion"),
                "date": date.isoformat(),
                "provinces": provinces,
            }
        except InvalidRow:
            excluded["invalid"] += 1
            continue

        if date < oldest:
            excluded["stale"] += 1
        elif not 0 < financing <= MAX_RATE:
            excluded["outOfRange"] += 1
        else:
            rows.append(row)

    return merge_provinces(rows), dict(excluded)


def results_of(payload: object, label: str) -> list:
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise SystemExit(f"{label}: la respuesta no tiene la forma esperada.")

    return payload["results"]


def check_url(url: str) -> str:
    parts = urllib.parse.urlparse(url)

    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise SystemExit(f"URL no permitida: {url}")

    return url


def fetch(path: str) -> object:
    url = check_url(urllib.parse.urljoin(API_BASE, path))
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "TuEconomia/1.0"})

    with urllib.request.urlopen(request, timeout=60) as response:
        check_url(response.geturl())
        body = response.read(MAX_RESPONSE_BYTES + 1)

    if len(body) > MAX_RESPONSE_BYTES:
        raise SystemExit(f"{path}: la respuesta supera {MAX_RESPONSE_BYTES} bytes.")

    return json.loads(body)


def load(source: str, input_dir: Path | None) -> object:
    if input_dir is None:
        return fetch(ENDPOINTS[source])

    return json.loads((input_dir / INPUT_FILES[source]).read_text(encoding="utf-8"))


def sort_rows(rows: list[dict], rate: str) -> list[dict]:
    """A stable order keeps the committed file's diff to the products that changed."""

    return sorted(rows, key=lambda row: (row["entityCode"], row["product"], row[rate], json.dumps(row, sort_keys=True, ensure_ascii=False)))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input-dir", type=Path, help="Read saved responses instead of calling the API.")
    args = parser.parse_args()

    today = dt.datetime.now(ARGENTINA).date()

    loans, loans_excluded = build_loans(results_of(load("loans", args.input_dir), "Préstamos personales"), today)
    cards, cards_excluded = build_cards(results_of(load("cards", args.input_dir), "Tarjetas de crédito"), today)

    if len(loans) < MIN_LOANS or len(cards) < MIN_CARDS:
        raise SystemExit(f"Se conservaron {len(loans)} préstamos y {len(cards)} tarjetas; el mínimo es {MIN_LOANS} y {MIN_CARDS}. No se escribió el archivo.")

    output = {
        "builtOn": today.isoformat(),
        "loans": sort_rows(loans, "cft"),
        "cards": sort_rows(cards, "financingTea"),
    }

    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"Préstamos: {len(loans)} filas, omitidas {loans_excluded}.", file=sys.stderr)
    print(f"Tarjetas: {len(cards)} filas, omitidas {cards_excluded}.", file=sys.stderr)


if __name__ == "__main__":
    main()
