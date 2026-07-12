# Owner Setup Checklist

Manual, account-level steps only the repository owner can do. Nothing in
this repository can complete these steps automatically. Do these once,
in order, before relying on the workflow in
[`docs/agent/WORKFLOW.md`](WORKFLOW.md).

## GitHub

- [ ] Confirm GitHub Actions is enabled for this repository
      (**Settings → Actions → General → Actions permissions**).
- [ ] Install and authorize the official Claude GitHub integration. The
      recommended path is to run `/install-github-app` inside the
      Claude Code terminal, which installs the Claude GitHub App on this
      repository and walks through the GitHub Actions workflow and
      secret setup interactively. You must be a repository admin.
      - Manual alternative, if `/install-github-app` isn't available:
        install the app at <https://github.com/apps/claude>, then add
        `ANTHROPIC_API_KEY` as a repository secret
        (**Settings → Secrets and variables → Actions → New repository
        secret**). This repository already contains a matching workflow
        template at `.github/workflows/claude.yml` — you do not need to
        copy `examples/claude.yml` yourself.
      - The Claude GitHub App requests **read & write** access to
        **Contents**, **Issues**, and **Pull requests** only.
- [ ] Configure the app's repository access to this repository only (not
      "all repositories") when prompted during installation.
- [ ] Add the `ANTHROPIC_API_KEY` secret (done as part of either setup
      path above). Do not use `ANTHROPIC_API_KEY` for anything other
      than this GitHub Actions integration.
- [ ] Connect Codex to GitHub and enable Codex code review for this
      repository, per Codex's own current setup instructions (outside
      the scope of this repository — follow the official OpenAI/Codex
      GitHub integration flow at the time you do this).
- [ ] Configure GitHub Mobile notifications so you see new comments on
      Issues/PRs promptly (**GitHub Mobile → Settings → Notifications**).
- [ ] Optionally create labels matching the issue templates
      (`agent-task`, `bug`, `ux`) if you want them pre-applied — the
      templates already set them by default, but the labels must exist
      in the repository for that to take visible effect.

## Branch ruleset for `master`

Configure at **Settings → Rules → Rulesets → New branch ruleset**,
targeting `master`:

- [ ] Require a pull request before merging.
- [ ] Require status checks to pass before merging.
- [ ] Require branches to be up to date before merging (if your review
      cadence tolerates the extra re-runs this causes).
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Require conversation resolution before merging (if available in
      your GitHub plan).
- [ ] Do not add any bypass list entry for agents/bots — only you (and
      any other human maintainers) should be able to bypass this
      ruleset, and ideally no one should.
- [ ] Keep merge as a human-only action — do not enable auto-merge for
      this repository, and do not authorize any agent account to merge.

Required status checks can only be selected in the GitHub UI **after**
they have run at least once (e.g. after opening one real pull request).
Once `.github/workflows/ci.yml` has run, select these exact check names
as required:

- `Unit / Static Checks`
- `Build`
- `E2E`

## Vercel

- [ ] Confirm the production branch in the Vercel project is `master`.
- [ ] Confirm PR/branch preview deployments are configured the way you
      want them (optional — not required for this workflow).
- [ ] Confirm only `master` deploys to production
      (`https://tanglak.vercel.app`) — no other branch should have
      production deploy permissions.
- [ ] After merging a pull request, check the Vercel dashboard to
      confirm the deployment succeeded before considering the task done.

## Secrets

- [ ] Never put a service-role or secret value in a `NEXT_PUBLIC_*`
      variable or any other client-exposed variable.
- [ ] Only add a GitHub Actions secret when a workflow clearly requires
      it (`ANTHROPIC_API_KEY` for `.github/workflows/claude.yml` is the
      only one required by the workflows in this repository as of this
      writing).
- [ ] Do not make secrets available to workflows triggered by
      fork/external pull requests. `.github/workflows/ci.yml` requests
      no secrets at all (it runs entirely with `E2E_MOCK_AUTH=1`); keep
      it that way rather than adding real credentials to it.
- [ ] Never paste a secret value into an Issue, a pull request
      description, or a comment — including when asking an agent to
      "debug" a secrets-related problem.
