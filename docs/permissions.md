# GitHub Authentication & Permissions

cmd-copilot-tools can use your GitHub credentials to raise the GitHub API rate
limit from 60 to 5,000 requests per hour. This document explains how the
permission system works, what is stored, and how to manage it.

## How permission works

On the **first time** you run a non-help command (anything other than
`--help`/`-h`), the tool shows a one-time prompt:

```
Welcome to cmd-copilot-tools!

This tool can use your GitHub credentials to access the GitHub API with a
higher rate limit (5,000 req/hr vs 60 req/hr unauthenticated).

Token resolution order (first match wins):
  1. GITHUB_TOKEN environment variable
  2. GH_TOKEN environment variable
  3. gh CLI  →  run: gh auth login

No credentials are stored by this tool. Tokens are read at runtime only.

Allow GitHub authentication? [y/N]:
```

Your answer (`y` or `N`) is saved as a single boolean in the permissions file.
The tool never stores the token itself.

After a new build (`npm run compile`) the first-time flag resets, so the prompt
runs again on the next invocation. This ensures users are always aware of the
auth state after an upgrade.

## What is stored

| File | Location | Contents |
|------|----------|----------|
| `permissions.json` | `%APPDATA%\cmd-git-copilot-tools\` (Windows)<br>`~/.config/cmd-git-copilot-tools/` (Linux/macOS) | `{ githubAuthEnabled, firstTimeUse, buildId }` |

Only a boolean (`githubAuthEnabled`) indicating whether the user granted
permission, a `firstTimeUse` flag, and a `buildId` string are persisted.
**No tokens, credentials, or personal data are ever written to disk.**

## Token resolution order

When `githubAuthEnabled` is `true`, the tool reads a token using the following
priority order (first match wins):

1. **`GITHUB_TOKEN` environment variable** — set this for CI/automation or to
   use a specific PAT.
2. **`GH_TOKEN` environment variable** — used by the GitHub CLI itself; set
   automatically if you configured `gh` with `GH_TOKEN`.
3. **`gh` CLI stored credentials** — if you have run `gh auth login`, the token
   is read at runtime via `gh auth token`. Nothing is copied or cached.

If none of the above resolves a token, requests are made unauthenticated.

## Managing permissions

| Command | Effect |
|---------|--------|
| `cmd-copilot-tools --permission on` | Enable GitHub auth (re-prompts if currently off; shows reminder if already on) |
| `cmd-copilot-tools --permission off` | Disable GitHub auth (reverts to 60 req/hr unauthenticated) |

### Enabling (`--permission on`)

If GitHub auth is currently **off**:
- The auth resolution order is displayed
- You are asked `Allow GitHub authentication? [y/N]`
- Your choice is saved

If GitHub auth is currently **on**:
- A reminder is shown with the resolution order and how to turn it off

### Disabling (`--permission off`)

Sets `githubAuthEnabled` to `false`. The tool will make all future API calls
without a token until you run `--permission on` again.

## Rate limits

| Scenario | Rate limit |
|----------|------------|
| No token (permission off or no credentials found) | 60 requests/hour |
| Authenticated (any token source) | 5,000 requests/hour |

GitHub rate limits are per IP address for unauthenticated requests, and per
account for authenticated requests. If you share an IP (e.g. corporate NAT),
the 60 req/hr pool is shared across all users on that IP.

## Setting a token manually

If you prefer to manage the token explicitly rather than using `gh auth login`:

```bash
# Bash / Zsh
export GITHUB_TOKEN=ghp_yourtoken

# PowerShell
$env:GITHUB_TOKEN = "ghp_yourtoken"

# Windows CMD
set GITHUB_TOKEN=ghp_yourtoken
```

Then run `cmd-copilot-tools --permission on` to enable auth.

## GitHub CLI quick start

```bash
# Install gh CLI: https://cli.github.com/
gh auth login
# Follow the prompts to authenticate with your GitHub account

# Verify
gh auth status
```

After `gh auth login` succeeds, enable auth in cmd-copilot-tools:

```bash
cmd-copilot-tools --permission on
```
