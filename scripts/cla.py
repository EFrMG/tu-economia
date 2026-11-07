"""Shared rules for the Tu Economía CLA acceptance tooling.

`accept-cla.py` (run by contributors) and `verify-cla.py` (run by the CLA workflow) both import this module, so the record format, the digest and the acceptance rules live in one place. Tests are in `test_cla.py`.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parents[1]
CLA_PATH = ROOT / "CLA.md"
ACCEPTED_DIR = ROOT / "cla" / "accepted"
VERSIONS_DIR = ROOT / "cla" / "versions"
EXEMPT_PATH = ROOT / ".github" / "cla-exempt.json"

# Repository-relative POSIX paths, as git and the pull request file listings spell them.
CLA_DIR_PREFIX = "cla/"
RECORD_PREFIX = "cla/accepted/"

VERSION_PATTERN = re.compile(r"^\*\*Version:\*\*[ \t]*(\S.*?)[ \t]*$", re.MULTILINE)
SAFE_VERSION = re.compile(r"[0-9A-Za-z][0-9A-Za-z._-]*")

RECORD_FIELDS = (
    "GitHub username",
    "GitHub user ID",
    "CLA version",
    "CLA SHA-256",
    "Accepted on",
    "Acceptance statement",
)

# Statuses under which a pull request may touch the author's own record.
RECORD_WRITE_STATUSES = frozenset({"added", "modified", "changed"})


def normalize(data: bytes) -> bytes:
    """Return `data` with CRLF line endings turned into LF, so a Windows checkout hashes like the repository blob."""

    return data.replace(b"\r\n", b"\n")


def digest(data: bytes) -> str:
    return hashlib.sha256(normalize(data)).hexdigest()


def cla_version(data: bytes) -> Optional[str]:
    match = VERSION_PATTERN.search(normalize(data).decode("utf-8"))

    return match.group(1) if match else None


def archive_errors(data: bytes, versions_dir: Path = VERSIONS_DIR) -> list[str]:
    """Check that `data` (the text of CLA.md) is a published version: archived unchanged under its own version number."""

    version = cla_version(data)

    if version is None:
        return ["Could not find the CLA version in CLA.md (expected `**Version:** ...`)."]

    if not SAFE_VERSION.fullmatch(version):
        return [f"The CLA version `{version}` in CLA.md is not a valid version label."]

    archive = versions_dir / f"{version}.md"

    if not archive.is_file():
        return [
            f"CLA.md version {version} has not been published: cla/versions/{version}.md is missing. "
            "The Maintainer must archive the text before contributions can be accepted."
        ]

    if normalize(archive.read_bytes()) != normalize(data):
        return [
            f"CLA.md differs from the archived text of version {version} (cla/versions/{version}.md). "
            "A changed CLA needs a new version number; the Maintainer must publish it before contributions can be accepted."
        ]

    return []


def record_repo_path(user_id: int) -> str:
    return f"{RECORD_PREFIX}{user_id}.md"


def acceptance_statement(version: str) -> str:
    return (
        "I have read and agree to the Individual Contributor License Agreement "
        f"for Tu Economía, version {version}."
    )


def render_record(login: str, user_id: int, version: str, cla_digest: str, accepted_on: str) -> str:
    return f"""# CLA Acceptance Record

**GitHub username:** {login}
**GitHub user ID:** {user_id}
**CLA version:** {version}
**CLA SHA-256:** {cla_digest}
**Accepted on:** {accepted_on}

**Acceptance statement:** {acceptance_statement(version)}
"""


def record_fields(text: str) -> tuple[dict[str, str], list[str]]:
    text = text.replace("\r\n", "\n")
    fields: dict[str, str] = {}
    errors: list[str] = []

    for name in RECORD_FIELDS:
        matches = re.findall(rf"^\*\*{re.escape(name)}:\*\*[ \t]*(.*?)[ \t]*$", text, re.MULTILINE)

        if len(matches) != 1:
            errors.append(f"The acceptance record must contain exactly one `{name}` field.")
            continue

        fields[name] = matches[0]

    return fields, errors


def record_errors(text: str, *, user_id: int, version: str, cla_digest: str) -> list[str]:
    """Validate an acceptance record for the account `user_id` against the current CLA. An empty list means valid."""

    fields, errors = record_fields(text)

    if errors:
        return errors

    if fields["GitHub user ID"] != str(user_id):
        errors.append("The GitHub numeric user ID in the acceptance record does not match this account.")

    if fields["CLA version"] != version:
        errors.append(
            f"The record is for CLA version {fields['CLA version']}; the current version is {version}. "
            "Please accept the current version by running `python3 scripts/accept-cla.py` again."
        )
    elif fields["CLA SHA-256"] != cla_digest:
        errors.append(
            "The record does not match the current text of CLA.md. "
            "Please review the current CLA and run `python3 scripts/accept-cla.py` again."
        )

    accepted_on = fields["Accepted on"]

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", accepted_on):
        errors.append("The acceptance date must use YYYY-MM-DD format.")
    else:
        try:
            dt.date.fromisoformat(accepted_on)
        except ValueError:
            errors.append("The acceptance date is not a valid calendar date.")

    # The statement embeds the version, so for a stale record the version error above already says it all.
    if fields["CLA version"] == version and fields["Acceptance statement"] != acceptance_statement(version):
        errors.append("The acceptance statement does not match the required text.")

    return errors


@dataclass(frozen=True)
class Account:
    login: str
    id: int
    type: str = "User"


@dataclass(frozen=True)
class Commit:
    sha: str
    email: str

    # None when the commit email is not linked to a GitHub account.
    author: Optional[Account]


@dataclass(frozen=True)
class ChangedFile:
    path: str
    status: str
    previous_path: Optional[str] = None


@dataclass(frozen=True)
class Exemptions:
    """Accounts whose pull requests are not checked: the Maintainer (by numeric ID) and listed bots."""

    maintainer_ids: frozenset
    bot_logins: frozenset

    def covers(self, account: Account) -> bool:
        if account.id in self.maintainer_ids:
            return True

        return account.type == "Bot" and account.login in self.bot_logins


def load_exemptions(path: Path = EXEMPT_PATH) -> Exemptions:
    data = json.loads(path.read_text(encoding="utf-8"))

    return Exemptions(
        maintainer_ids=frozenset(int(entry["id"]) for entry in data.get("maintainers", [])),
        bot_logins=frozenset(str(login) for login in data.get("bots", [])),
    )


RecordReader = Callable[[int], Optional[str]]


def account_errors(
    account: Account,
    sources: tuple,
    *,
    version: str,
    cla_digest: str,
    is_author: bool,
) -> list[str]:
    """Look for a valid record of `account` in each source in turn; report the first source's problems if none is valid."""

    first_problems: Optional[list[str]] = None

    for read_record in sources:
        text = read_record(account.id)

        if text is None:
            continue

        problems = record_errors(text, user_id=account.id, version=version, cla_digest=cla_digest)

        if not problems:
            return []

        if first_problems is None:
            first_problems = problems

    if first_problems is not None:
        return [f"@{account.login}: {problem}" for problem in first_problems]

    path = record_repo_path(account.id)

    if is_author:
        return [
            f"No CLA acceptance record found for @{account.login}. "
            f"Run `python3 scripts/accept-cla.py`, commit the generated file ({path}) and update this pull request."
        ]

    return [
        f"@{account.login} authored commits in this pull request but has no CLA acceptance record in the repository. "
        f"Ask them to open a pull request that contains only their record ({path})."
    ]


def record_change_errors(author: Account, files: list[ChangedFile]) -> list[str]:
    """A pull request may add or update its author's own record and nothing else under cla/."""

    own = record_repo_path(author.id)
    errors: list[str] = []

    for changed in files:
        for path in (changed.path, changed.previous_path):
            if not path or not path.startswith(CLA_DIR_PREFIX):
                continue

            if path == own and changed.status in RECORD_WRITE_STATUSES:
                continue

            errors.append(
                f"This pull request may only add or update your own acceptance record ({own}), "
                f"but it changes {path}. Files under cla/ are managed by the Maintainer."
            )

    return list(dict.fromkeys(errors))


def check_pull_request(
    *,
    author: Account,
    commits: list[Commit],
    files: list[ChangedFile],
    version: str,
    cla_digest: str,
    exemptions: Exemptions,
    read_head_record: RecordReader,
    read_base_record: RecordReader,
) -> list[str]:
    """Return every reason a pull request fails the CLA check. An empty list means it passes.

    The author's record may come from the pull request head or from the base branch. Any other commit author must already have a record on the base branch, because a record added by someone else on their behalf proves nothing.
    """

    if exemptions.covers(author):
        return []

    errors: list[str] = []
    accounts = {author.id: author}

    for commit in commits:
        if commit.author is None:
            errors.append(
                f"Commit {commit.sha[:7]} is authored by {commit.email}, which is not linked to a GitHub account. "
                "Link the address in your GitHub settings or re-author the commit, then update this pull request."
            )
            continue

        accounts.setdefault(commit.author.id, commit.author)

    for account in accounts.values():
        if exemptions.covers(account):
            continue

        is_author = account.id == author.id
        sources = (read_head_record, read_base_record) if is_author else (read_base_record,)

        errors.extend(
            account_errors(account, sources, version=version, cla_digest=cla_digest, is_author=is_author)
        )

    errors.extend(record_change_errors(author, files))

    return errors
