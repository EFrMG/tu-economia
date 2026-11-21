#!/usr/bin/env bash
# Runs the monthly Precios refresh in one go: download, aggregate, build, then the repository checks. See "Refreshing" in docs/product-price-feed.md.
#
# Run it from a machine in Argentina: datos.produccion.gob.ar refuses GitHub's runners and may refuse other foreign IPs.
#
#     scripts/refresh-prices.sh [work-directory]   # defaults to $SEPA_WORK, then ${TMPDIR:-/tmp}/sepa
#
# It commits nothing; review the generated files and commit them.

set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${1:-${SEPA_WORK:-${TMPDIR:-/tmp}/sepa}}"

mkdir -p "$work"
work="$(cd "$work" && pwd)"

# A shared temporary directory could hold a folder another user created first.
if [[ ! -O "$work" ]]; then
  echo "The work directory is not owned by you: $work" >&2
  exit 1
fi

# The archive is untrusted input and about 320 MB, so it never lives inside the repository.
case "$work/" in
  "$repo"/*)
    echo "The work directory must be outside the repository: $work" >&2
    exit 1
    ;;
esac

cd "$repo"

python3 -c 'import sys; assert sys.version_info >= (3, 11), f"Python 3.11 or later is required, found {sys.version}"'

python3 -I scripts/build-price-basket.py download --work "$work"

# The download replaces the archive of its weekday, so the newest file is the one just fetched.
shopt -s nullglob
archive=""

for candidate in "$work"/sepa_*.zip; do
  if [[ -z "$archive" || "$candidate" -nt "$archive" ]]; then
    archive="$candidate"
  fi
done

shopt -u nullglob

if [[ -z "$archive" ]]; then
  echo "No sepa_<día>.zip archive in $work after the download; the published file name may have changed." >&2
  exit 1
fi

python3 -I scripts/build-price-basket.py aggregate --archive "$archive" --work "$work"

if ! python3 -I scripts/build-price-basket.py build --work "$work"; then
  echo >&2
  echo "The build failed. If a basket GTIN left the archive, run:" >&2
  echo "  python3 -I scripts/build-price-basket.py candidates --work \"$work\"" >&2
  echo "then replace it in scripts/price-basket.json from $work/candidates.md. Only build reads the basket, so finish without downloading again:" >&2
  echo "  python3 -I scripts/build-price-basket.py build --work \"$work\" && pnpm test" >&2
  exit 1
fi

pnpm test
pnpm exec wrangler deploy --dry-run

echo
git status --short -- app/lib/price-basket.generated.json app/lib/price-basket-server.generated.json public/precios
echo
echo "Checks passed."
