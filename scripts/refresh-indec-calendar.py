"""Downloads INDEC's semester diffusion calendar and converts it to text.

INDEC publishes one calendar PDF per semester at
https://www.indec.gob.ar/ftp/cuadros/publicaciones/calendario_{1|2}sem{YYYY}.pdf
This script tries the covering, next and previous semester URLs in that order,
downloads the first that answers, and converts it with `pdftotext -layout`
(poppler-utils) into sources/INDEC/. The parsing into app/lib/indec-calendar.ts
stays manual; the resulting file is a reminder to check the new dates.

Only the standard library is used. Run with `python3 -I` (3.11+); requires
`pdftotext` on PATH (poppler-utils).

    python3 -I scripts/refresh-indec-calendar.py
    python3 -I scripts/refresh-indec-calendar.py --out-dir /tmp/indec
"""

import argparse
import datetime as dt
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO / "sources" / "INDEC"

# INDEC publishes on the Argentine calendar.
ARGENTINA = dt.timezone(dt.timedelta(hours=-3))

CALENDAR_BASE = "https://www.indec.gob.ar/ftp/cuadros/publicaciones/calendario_{}sem{}.pdf"
USER_AGENT = "TuEconomia/1.0 (refresh-indec-calendar)"
MAX_BYTES = 5_000_000


def candidate_urls(today: dt.date) -> list[str]:
    if today.month >= 7:
        covering = (2, today.year)
    else:
        covering = (1, today.year)

    if covering[0] == 2:
        nxt = (1, today.year + 1)
    else:
        nxt = (2, today.year)

    if covering[0] == 1:
        prev = (2, today.year - 1)
    else:
        prev = (1, today.year)

    urls: list[str] = []
    seen: set[str] = set()
    for sem, yr in (covering, nxt, prev):
        url = CALENDAR_BASE.format(sem, yr)
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def download(url: str) -> bytes | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read(MAX_BYTES + 1)
    except Exception as error:  # noqa: BLE001 - network/HTTP errors are expected
        print(f"Not available: {url} ({error})", file=sys.stderr)
        return None
    if len(data) > MAX_BYTES:
        print(f"Response too large: {url}", file=sys.stderr)
        return None
    if not data.startswith(b"%PDF"):
        print(f"Not a PDF: {url}", file=sys.stderr)
        return None
    return data


def convert(pdf_path: Path, text_path: Path) -> None:
    subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), str(text_path)],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help="Directory to write the converted text into (default: sources/INDEC).",
    )
    args = parser.parse_args()

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    today = dt.datetime.now(ARGENTINA).date()
    for url in candidate_urls(today):
        data = download(url)
        if data is None:
            continue
        name = url.rsplit("/", 1)[-1].replace(".pdf", "")
        text_path = out_dir / f"{name}.txt"
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            pdf_path = Path(tmp.name)
        try:
            convert(pdf_path, text_path)
        except (subprocess.CalledProcessError, FileNotFoundError) as error:
            print(f"Conversion failed for {url}: {error}", file=sys.stderr)
            pdf_path.unlink(missing_ok=True)
            continue
        finally:
            pdf_path.unlink(missing_ok=True)
        print(f"Downloaded {url} -> {text_path}")
        return 0

    print("No calendar could be downloaded.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())