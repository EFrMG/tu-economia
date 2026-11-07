#!/usr/bin/env python3
"""Create a version-specific CLA acceptance record for Tu Economía.

Requires:
  - Python 3.9+
  - GitHub CLI (`gh`)
  - An authenticated GitHub CLI session (`gh auth login`)

Running it again is safe: it does nothing while your record matches the current CLA, and replaces a stale record once you accept the new version.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys

import cla


def fail(message: str, exit_code: int = 1) -> None:
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(exit_code)


def current_user() -> tuple[str, int]:
    try:
        result = subprocess.run(
            ["gh", "api", "user", "--jq", "{login: .login, id: .id}"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        fail("GitHub CLI (`gh`) is not installed. Install it from https://cli.github.com/")
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or "GitHub CLI authentication failed."
        fail(f"{detail} Run `gh auth login` and try again.")

    try:
        user = json.loads(result.stdout)
        login = user["login"]
        user_id = int(user["id"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        fail("Could not read your GitHub username and numeric user ID from `gh api user`.")

    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", login):
        fail("GitHub returned an unexpected username format.")

    return login, user_id


def main() -> None:
    if not cla.CLA_PATH.is_file():
        fail(f"Could not find {cla.CLA_PATH}. Run this script from a Project checkout.")

    cla_bytes = cla.CLA_PATH.read_bytes()
    version = cla.cla_version(cla_bytes)

    if version is None:
        fail("Could not find the CLA version in CLA.md (expected `**Version:** ...`).")

    problems = cla.archive_errors(cla_bytes)

    if problems:
        fail(
            f"{problems[0]} If you did not edit CLA.md yourself, update your checkout from the "
            "Project's main branch and try again."
        )

    cla_digest = cla.digest(cla_bytes)
    login, user_id = current_user()
    record_path = cla.ACCEPTED_DIR / f"{user_id}.md"
    relative_path = record_path.relative_to(cla.ROOT)

    if record_path.is_file():
        existing = record_path.read_text(encoding="utf-8")

        if not cla.record_errors(existing, user_id=user_id, version=version, cla_digest=cla_digest):
            print(f"@{login} has already accepted CLA version {version} ({relative_path}). Nothing to do.")

            return

    print()
    print(f"GitHub account: @{login} (ID: {user_id})")
    print(f"CLA version:    {version}")
    print(f"CLA SHA-256:    {cla_digest}")
    print()
    print("Read CLA.md before continuing.")

    try:
        confirmation = input(
            "To confirm that you have read and agree to this CLA version, type ACCEPT: "
        ).strip()
    except EOFError:
        print()
        confirmation = ""

    if confirmation != "ACCEPT":
        print("Acceptance was not confirmed; no record was created.")

        raise SystemExit(1)

    accepted_on = dt.datetime.now(dt.timezone.utc).date().isoformat()
    record = cla.render_record(login, user_id, version, cla_digest, accepted_on)

    cla.ACCEPTED_DIR.mkdir(parents=True, exist_ok=True)

    # LF endings on every platform, so the record reads the same wherever it was generated.
    with open(record_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(record)

    print()
    print(f"Acceptance record created: {relative_path}")
    print("Commit this file and include it in your pull request.")


if __name__ == "__main__":
    main()
