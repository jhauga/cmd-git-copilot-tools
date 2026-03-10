# GitHub Authentication & Permissions

cmd-copilot-tools can use your GitHub credentials to raise the GitHub API rate
limit from 60 to 5,000 requests per hour. This document explains how the
permission system works, what is stored, and how to manage it.

## How permission works

On the **first time** you run a non-help command (anything other than
`--help`/`-h`), the tool shows a one-time prompt:

```text
Welcome to cmd-copilot-tools!

This tool can use your GitHub credentials to access the GitHub API with a
higher rate limit (5,000 req/hr vs 60 req/hr unauthenticated).

Token resolution order (first match wins):
  1. GITHUB_TOKEN environment variable
  2. GH_TOKEN environment variable
  3. gh CLI  →  run: gh auth login

No credentials are stored by this tool. Tokens are read at runtime only.

To always allow authentication without prompting after builds, input [always]

Allow GitHub authentication? [y/N/always]:
```

Your answer (`y`, `N`, or `always`) is saved in the permissions file.
The tool never stores the token itself.

**New in version 1.x:** The `always` option permanently enables authentication
and prevents the prompt from re-appearing after builds (`npm run compile`),
making it ideal for development workflows where you want uninterrupted access.

After a new build (`npm run compile`):

- If you chose `y` (on mode): the first-time flag resets, so the prompt runs again
- If you chose `always`: authentication stays enabled with no prompt
- If you chose `N` (off mode): authentication stays disabled with no prompt

## What is stored

| File               | Location                                                                                          | Contents                                                     |
|--------------------|-------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| `permissions.json` | `%APPDATA%\cmd-git-copilot-tools\` (Windows)<br>`~/.config/cmd-git-copilot-tools/` (Linux/macOS) | `{ githubAuthEnabled, authMode, firstTimeUse, buildId }` |

A boolean (`githubAuthEnabled`) indicating whether authentication is active,
an `authMode` string (`'off'`, `'on'`, or `'always'`), a `firstTimeUse` flag,
and a `buildId` string are persisted.
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

| Command                                 | Effect                                                                     |
|---------------------------------------|----------------------------------------------------------------------------|
| `cmd-copilot-tools --permission`        | Show current permission status and available options                        |
| `cmd-copilot-tools --permission on`     | Enable GitHub auth for current build (re-prompts after `npm run compile`)  |
| `cmd-copilot-tools --permission off`    | Disable GitHub auth (reverts to 60 req/hr unauthenticated)                |
| `cmd-copilot-tools --permission always` | Enable GitHub auth permanently (no prompts after builds)                   |

### Enabling (`--permission on`)

If GitHub auth is currently **off**:

- The auth resolution order is displayed
- You are asked `Allow GitHub authentication? [y/N/always]`
- Respond with `y` for one-time approval (re-prompts after builds)
- Respond with `always` to enable permanently with no future prompts
- Your choice is saved

If GitHub auth is currently **on** or **always**:

- A reminder is shown with the current mode, resolution order, and how to change it

### Disabling (`--permission off`)

Sets `authMode` to `'off'` and `githubAuthEnabled` to `false`. The tool will
make all future API calls without a token until you run `--permission on` or
`--permission always` again.

### Always mode (`--permission always`)

Sets `authMode` to `'always'` and `githubAuthEnabled` to `true`. This mode:

- Enables GitHub authentication immediately
- Persists across builds (`npm run compile`) without re-prompting
- Ideal for development workflows where you want uninterrupted API access
- Can be disabled anytime with `--permission off`

## Rate limits

| Scenario                                       | Rate limit           |
|------------------------------------------------|---------------------|
| No token (permission off or no credentials found) | 60 requests/hour     |
| Authenticated (any token source)                 | 5,000 requests/hour |

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
