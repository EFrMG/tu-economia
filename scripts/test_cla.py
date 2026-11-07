"""Tests for the CLA acceptance rules. Run with `python3 -m unittest discover -s scripts`."""

import tempfile
import unittest
from pathlib import Path

import cla

TEXT = "# CLA\n\n**Version:** 2.1\n\nBody.\n"
VERSION = "2.1"
DIGEST = cla.digest(TEXT.encode())

ALICE = cla.Account("Alice", 1001)
BOB = cla.Account("Bob", 1002)
MAINTAINER = cla.Account("Maint", 1)
DEPENDABOT = cla.Account("dependabot[bot]", 49699333, "Bot")
EXEMPT = cla.Exemptions(frozenset({1}), frozenset({"dependabot[bot]"}))


def record_for(account, version=VERSION, cla_digest=DIGEST, accepted_on="2026-11-01"):
    return cla.render_record(account.login, account.id, version, cla_digest, accepted_on)


def check(author=ALICE, commits=(), files=(), head=None, base=None, exemptions=EXEMPT):
    head = head or {}
    base = base or {}

    return cla.check_pull_request(
        author=author,
        commits=list(commits),
        files=list(files),
        version=VERSION,
        cla_digest=DIGEST,
        exemptions=exemptions,
        read_head_record=head.get,
        read_base_record=base.get,
    )


class DigestTests(unittest.TestCase):
    def test_crlf_checkout_hashes_like_the_repository_blob(self):
        self.assertEqual(cla.digest(TEXT.encode()), cla.digest(TEXT.replace("\n", "\r\n").encode()))

    def test_any_other_change_alters_the_digest(self):
        self.assertNotEqual(cla.digest(TEXT.encode()), cla.digest((TEXT + " ").encode()))

    def test_version_is_read_from_the_header(self):
        self.assertEqual(cla.cla_version(TEXT.encode()), VERSION)
        self.assertEqual(cla.cla_version(TEXT.replace("\n", "\r\n").encode()), VERSION)
        self.assertIsNone(cla.cla_version(b"# No version here\n"))


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.versions = Path(self.directory.name)

    def test_published_version_passes(self):
        (self.versions / f"{VERSION}.md").write_text(TEXT)

        self.assertEqual(cla.archive_errors(TEXT.encode(), self.versions), [])

    def test_archive_with_crlf_still_matches(self):
        (self.versions / f"{VERSION}.md").write_bytes(TEXT.replace("\n", "\r\n").encode())

        self.assertEqual(cla.archive_errors(TEXT.encode(), self.versions), [])

    def test_unpublished_version_is_rejected(self):
        self.assertIn("has not been published", cla.archive_errors(TEXT.encode(), self.versions)[0])

    def test_edited_text_under_the_same_version_is_rejected(self):
        (self.versions / f"{VERSION}.md").write_text(TEXT)

        self.assertIn("differs from the archived text", cla.archive_errors((TEXT + "More.\n").encode(), self.versions)[0])

    def test_version_label_cannot_escape_the_directory(self):
        evil = "# CLA\n\n**Version:** ../../etc/passwd\n"

        self.assertIn("not a valid version label", cla.archive_errors(evil.encode(), self.versions)[0])

    def test_missing_version_is_rejected(self):
        self.assertIn("Could not find the CLA version", cla.archive_errors(b"# nothing\n", self.versions)[0])

    def test_the_repository_cla_is_a_published_version(self):
        self.assertEqual(cla.archive_errors(cla.CLA_PATH.read_bytes()), [])


class RecordTests(unittest.TestCase):
    def errors(self, text, account=ALICE):
        return cla.record_errors(text, user_id=account.id, version=VERSION, cla_digest=DIGEST)

    def test_generated_record_is_valid(self):
        self.assertEqual(self.errors(record_for(ALICE)), [])

    def test_crlf_record_is_valid(self):
        self.assertEqual(self.errors(record_for(ALICE).replace("\n", "\r\n")), [])

    def test_record_of_another_account_is_rejected(self):
        self.assertIn("does not match this account", self.errors(record_for(BOB))[0])

    def test_old_version_is_rejected(self):
        self.assertIn("current version is 2.1", self.errors(record_for(ALICE, version="2.0"))[0])

    def test_changed_text_under_the_same_version_is_rejected(self):
        self.assertIn("does not match the current text", self.errors(record_for(ALICE, cla_digest="0" * 64))[0])

    def test_bad_dates_are_rejected(self):
        self.assertIn("YYYY-MM-DD", self.errors(record_for(ALICE, accepted_on="yesterday"))[0])
        self.assertIn("YYYY-MM-DD", self.errors(record_for(ALICE, accepted_on="20261101"))[0])
        self.assertIn("valid calendar date", self.errors(record_for(ALICE, accepted_on="2026-02-31"))[0])

    def test_altered_statement_is_rejected(self):
        text = record_for(ALICE).replace("I have read and agree", "I have skimmed")

        self.assertIn("acceptance statement", self.errors(text)[0])

    def test_duplicate_or_empty_fields_are_rejected(self):
        self.assertIn("exactly one `GitHub user ID`", self.errors(record_for(ALICE) + "**GitHub user ID:** 1001\n")[0])
        self.assertTrue(self.errors(record_for(ALICE).replace("1001", "")))

    def test_an_empty_field_does_not_borrow_the_next_line(self):
        text = record_for(ALICE).replace("**GitHub user ID:** 1001", "**GitHub user ID:**")
        fields, _ = cla.record_fields(text)

        self.assertEqual(fields["GitHub user ID"], "")


class PullRequestTests(unittest.TestCase):
    def test_author_with_a_record_in_the_pull_request_passes(self):
        files = [cla.ChangedFile(cla.record_repo_path(ALICE.id), "added")]

        self.assertEqual(check(files=files, head={ALICE.id: record_for(ALICE)}), [])

    def test_author_with_a_record_already_merged_passes(self):
        self.assertEqual(check(base={ALICE.id: record_for(ALICE)}), [])

    def test_missing_record_is_reported_with_its_path(self):
        errors = check()

        self.assertEqual(len(errors), 1)
        self.assertIn("No CLA acceptance record found for @Alice", errors[0])
        self.assertIn("cla/accepted/1001.md", errors[0])

    def test_stale_record_in_the_head_is_replaced_by_a_valid_merged_one(self):
        head = {ALICE.id: record_for(ALICE, version="2.0")}
        base = {ALICE.id: record_for(ALICE)}

        self.assertEqual(check(head=head, base=base), [])

    def test_stale_record_everywhere_is_reported_once(self):
        errors = check(head={ALICE.id: record_for(ALICE, version="2.0")})

        self.assertEqual(len(errors), 1)
        self.assertTrue(errors[0].startswith("@Alice: "))

    def test_record_copied_from_another_account_is_rejected(self):
        self.assertTrue(check(head={ALICE.id: record_for(BOB)}))

    def test_commit_author_without_a_merged_record_is_rejected(self):
        commits = [cla.Commit("abcdef123", "bob@example.com", BOB)]
        head = {ALICE.id: record_for(ALICE), BOB.id: record_for(BOB)}

        errors = check(commits=commits, head=head)

        self.assertEqual(len(errors), 1)
        self.assertIn("@Bob authored commits", errors[0])

    def test_commit_author_with_a_merged_record_passes(self):
        commits = [cla.Commit("abcdef123", "bob@example.com", BOB)]
        base = {ALICE.id: record_for(ALICE), BOB.id: record_for(BOB)}

        self.assertEqual(check(commits=commits, base=base), [])

    def test_commit_with_an_unlinked_email_is_rejected(self):
        commits = [cla.Commit("abcdef123", "ghost@example.com", None)]

        errors = check(commits=commits, base={ALICE.id: record_for(ALICE)})

        self.assertEqual(len(errors), 1)
        self.assertIn("abcdef1", errors[0])
        self.assertIn("ghost@example.com", errors[0])

    def test_maintainer_pull_request_is_not_checked(self):
        commits = [cla.Commit("abcdef123", "agent@localhost", None)]

        self.assertEqual(check(author=MAINTAINER, commits=commits), [])

    def test_maintainer_commits_in_a_contributor_pull_request_are_allowed(self):
        commits = [cla.Commit("abcdef123", "m@example.com", MAINTAINER)]

        self.assertEqual(check(commits=commits, base={ALICE.id: record_for(ALICE)}), [])

    def test_listed_bot_is_exempt_but_an_unlisted_one_is_not(self):
        self.assertEqual(check(author=DEPENDABOT), [])
        self.assertTrue(check(author=cla.Account("renovate[bot]", 29139614, "Bot")))

    def test_a_human_cannot_borrow_a_bot_login(self):
        self.assertTrue(check(author=cla.Account("dependabot[bot]", 7, "User")))

    def test_pull_request_may_only_touch_the_authors_own_record(self):
        own = cla.record_repo_path(ALICE.id)
        other = cla.record_repo_path(BOB.id)
        base = {ALICE.id: record_for(ALICE)}

        self.assertEqual(check(files=[cla.ChangedFile(own, "modified")], base=base), [])
        self.assertEqual(check(files=[cla.ChangedFile("app/routes.ts", "modified")], base=base), [])
        self.assertTrue(check(files=[cla.ChangedFile(other, "modified")], base=base))
        self.assertTrue(check(files=[cla.ChangedFile(own, "removed")], base=base))
        self.assertTrue(check(files=[cla.ChangedFile("cla/versions/2.1.md", "modified")], base=base))
        self.assertTrue(check(files=[cla.ChangedFile(own, "renamed", other)], base=base))

    def test_repeated_file_errors_are_reported_once(self):
        files = [cla.ChangedFile("cla/accepted/9.md", "renamed", "cla/accepted/9.md")]

        self.assertEqual(len(check(files=files, base={ALICE.id: record_for(ALICE)})), 1)


class ExemptionsFileTests(unittest.TestCase):
    def test_the_repository_file_names_the_maintainer(self):
        exemptions = cla.load_exemptions()

        self.assertTrue(exemptions.maintainer_ids)
        self.assertTrue(all(isinstance(identifier, int) for identifier in exemptions.maintainer_ids))


if __name__ == "__main__":
    unittest.main()
