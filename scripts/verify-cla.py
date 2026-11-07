#!/usr/bin/env python3
"""Verify the CLA status of a pull request. Run by .github/workflows/cla-check.yml.

This runs from a checkout of the BASE branch, so CLA.md, the exemptions and this code are the Maintainer's, never the pull request's. The pull request head is only read as data: `git show` of a record file from the ref fetched by the workflow, and API listings of its commits and files. Nothing from the head is executed.

Environment: PR_NUMBER, PR_AUTHOR_LOGIN, PR_AUTHOR_ID, PR_AUTHOR_TYPE, REPO, and GH_TOKEN for `gh`.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Optional

import cla

# The workflow fetches the pull request head into this ref.
HEAD_REF = "refs/cla/pr-head"

# The pull request commits endpoint returns at most this many commits.
COMMITS_API_LIMIT = 250

COMMITS_JQ = (
    ".[] | {sha: .sha, email: .commit.author.email, "
    "author: (if .author then {login: .author.login, id: .author.id, type: .author.type} else null end)}"
)
FILES_JQ = ".[] | {path: .filename, status: .status, previous_path: .previous_filename}"


def annotate(message: str) -> str:
    """Format `message` as a workflow error annotation, escaping what the runner treats as markup."""

    escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")

    return f"::error::{escaped}"


def reject(messages: list[str]) -> None:
    for message in messages:
        print(annotate(message))

    raise SystemExit(1)


def gh_lines(path: str, jq: str) -> list[dict]:
    result = subprocess.run(
        ["gh", "api", "--paginate", path, "--jq", jq],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if result.returncode != 0:
        reject([f"Could not read {path} from the GitHub API: {result.stderr.strip()}"])

    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def account_from(data: Optional[dict]) -> Optional[cla.Account]:
    if data is None:
        return None

    return cla.Account(login=data["login"], id=int(data["id"]), type=data.get("type") or "User")


def read_head_record(user_id: int) -> Optional[str]:
    result = subprocess.run(
        ["git", "show", f"{HEAD_REF}:{cla.record_repo_path(user_id)}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    return result.stdout if result.returncode == 0 else None


def read_base_record(user_id: int) -> Optional[str]:
    path = cla.ACCEPTED_DIR / f"{user_id}.md"

    return path.read_text(encoding="utf-8") if path.is_file() else None


def main() -> None:
    env = os.environ
    repo = env["REPO"]
    number = env["PR_NUMBER"]

    author = cla.Account(
        login=env["PR_AUTHOR_LOGIN"],
        id=int(env["PR_AUTHOR_ID"]),
        type=env.get("PR_AUTHOR_TYPE") or "User",
    )
    exemptions = cla.load_exemptions()

    if exemptions.covers(author):
        print(f"@{author.login} is exempt from the CLA check (Maintainer or listed bot).")

        return

    cla_bytes = cla.CLA_PATH.read_bytes()
    problems = cla.archive_errors(cla_bytes)

    if problems:
        reject(problems)

    version = cla.cla_version(cla_bytes)
    commit_rows = gh_lines(f"repos/{repo}/pulls/{number}/commits", COMMITS_JQ)

    if len(commit_rows) >= COMMITS_API_LIMIT:
        reject(["This pull request has too many commits to verify automatically; the Maintainer must check commit authors by hand."])

    commits = [
        cla.Commit(sha=row["sha"], email=row.get("email") or "an unknown email", author=account_from(row.get("author")))
        for row in commit_rows
    ]
    files = [
        cla.ChangedFile(path=row["path"], status=row["status"], previous_path=row.get("previous_path"))
        for row in gh_lines(f"repos/{repo}/pulls/{number}/files", FILES_JQ)
    ]

    errors = cla.check_pull_request(
        author=author,
        commits=commits,
        files=files,
        version=version,
        cla_digest=cla.digest(cla_bytes),
        exemptions=exemptions,
        read_head_record=read_head_record,
        read_base_record=read_base_record,
    )

    if errors:
        reject(errors)

    print(f"CLA accepted: @{author.login} (GitHub user ID {author.id}), version {version}.")


if __name__ == "__main__":
    main()
