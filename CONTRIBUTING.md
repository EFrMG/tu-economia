# Tu Economía. Contribution Guidelines

Thank you for considering contributing to _Tu Economía_!

## Before opening a pull request

1. Read the [Individual Contributor License Agreement](CLA.md).
2. Create your CLA acceptance record (instructions below) and commit it to a fork's branch.
3. Remember to run `mise exec -- pnpm test` before you open the pull request.
4. Open a pull request describing the changes and their motivation. Include the acceptance record.

## What you are agreeing to

The [CLA](CLA.md) is the binding text. In plain words:

- You keep the copyright in your contributions.
- You give the Maintainer a perpetual, irrevocable, worldwide license to use them in any way, including commercially, in proprietary or closed-source software and in hosted or paid services, and to sublicense them to others.
- _Tu Economía_ is currently published under the [PolyForm Noncommercial License 1.0.0](LICENSE), so the public receives your contribution for noncommercial purposes only. The Maintainer is not limited by that license and may also use your contribution commercially, and may change how the Project is licensed in the future.
- You are not paid for your contribution and have no say in how the Project is licensed or commercialized.
- You confirm that you have the right to contribute what you submit, and that you have identified any third-party material in it and its license.
- Contributions made with generative AI tools are allowed. **They are treated as your own work**: you must review and test them, and you are responsible for them as if you had written them yourself. An automated agent acting on your account accounts for the same.
- It gives you no rights to the _Tu Economía_ name, logo, or other marks, and a fork or derivative distribution must use its own name. It does let the Maintainer credit you as a contributor of _Tu Economía_.

If you are not comfortable with these terms, please do not contribute.

## Accepting the CLA

We require contributors to accept the CLA before their contributions can be merged.

You only need to create an acceptance record once for each CLA version.

The CLA says which pull requests the record covers: the one that carries it and every later one.

### Requirements

- Install the [GitHub CLI](https://cli.github.com/). Authenticate it with the GitHub account you will use to open your pull request:

  ```bash
  gh auth login
  ```

- Read the agreement, then run:

  ```bash
  python3 scripts/accept-cla.py
  ```

The script obtains your GitHub username and numeric account ID from the authenticated GitHub CLI session. It displays the CLA version and its SHA-256 digest, asks you to explicitly confirm acceptance, and creates `cla/accepted/<your-github-user-id>.md`

Commit that file, including it in your first ever pull request to the project.

The acceptance record is tied to the exact text of `CLA.md`. Every published version of the CLA is kept unchanged under `cla/versions/`, and any change to the agreement is published as a new version. When that happens, run the same command again to review and accept the new version; it replaces your old record. Running it while your record is current does nothing.

If the CLA version changes, a [CI workflow](.github/workflows/cla-check.yml) will make it apparent, as well as if you haven't accepted it in the first place.

The record is named after your numeric GitHub ID, so it stays valid if you rename your account.

## Pull request checks

The `CLA / Verify CLA` check runs from the branch your pull request targets, not from your changes, so a pull request cannot change how it is judged. It validates:

- A valid acceptance record exists for the pull request author, either in the pull request or already in the repository: the recorded user ID matches the author's account, the CLA version and SHA-256 digest match the current `CLA.md`, and the record contains the required acceptance statement and a valid date.
- The author of every other commit in the pull request already has a valid record in the repository. If you are including someone else's commits, ask them to open a pull request that contains only their record first. Commits whose email address is not linked to a GitHub account cannot be checked, so link the address in your GitHub settings or re-author the commit.
- The pull request does not change anything under `cla/` except your own record. The Maintainer manages the rest.

The check does not read `Co-authored-by:` trailers. If a pull request includes work by someone who authored no commits of their own, the Maintainer must verify their acceptance separately before merging. Please, try notifying me of that case unless it is a bot you're Co-authored-by-ing.

The Maintainer and a short list of trusted bots (see `.github/cla-exempt.json`) are not checked.

If the check fails, read its message, generate or correct your acceptance record, and push the change to the same pull request.

## Privacy

The acceptance record stores your GitHub username, numeric GitHub user ID, CLA version, CLA digest, and acceptance date. It does not ask you to publish your legal name or email address in the repository.

## Legal notices

If you become aware that a representation in the CLA was inaccurate, or that a third party claims rights in a Contribution that conflict with the CLA, tell the Maintainer privately. Do not open a public issue for a legal notice. Use one of these channels:

- Email: <macias.francisco.355237995@gmail.com>
- Portfolio: <https://francisco.is-a.dev/>
- GitHub: the repository's private reporting form under **Security -> Report a vulnerability**.

You do not need to investigate or monitor third parties; the duty merely applies to what you already know.

## Review and merging

Passing the CLA check does not guarantee that a contribution will be accepted. Contributions remain subject to normal review, project requirements, and the Maintainer's decision.
