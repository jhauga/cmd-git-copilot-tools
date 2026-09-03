# Configuration Guide

This document provides a comprehensive reference for all configuration options available in the Git Copilot Tools command-line tool.

## Config File Location

- **Linux/macOS**: `~/.config/cmd-git-copilot-tools/config.json`
- **Windows**: `%APPDATA%\cmd-git-copilot-tools\config.json`

All settings live in this JSON file. The file is created automatically with defaults on first run.

## Settings

### `sources`

**Type:** `array`
**Default:**

```json
[
  {
    "owner": "github",
    "repo": "awesome-copilot",
    "label": "GitHub Awesome Copilot"
  },
  {
    "owner": "jhauga",
    "repo": "cmd-git-copilot-tools",
    "label": "CMD Git Copilot Tools"
  }
]
```

An array of GitHub repository sources to browse content from. Each entry is an object with the following properties:

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `owner` | `string` | Yes | GitHub repository owner (user or organization) |
| `repo` | `string` | Yes | GitHub repository name |
| `label` | `string` | No | Display name and shorthand label for `--use` |
| `baseUrl` | `string` | No | GitHub Enterprise Server base URL (e.g., `https://github.example.com`) |
| `branch` | `string` | No | Branch, tag, or commit SHA to read content from |
| `folderMappings` | `object` | No | Custom folder-to-category mappings (see below) |
| `aiFolder` | `string` | No | A.I. folder this source downloads into (see [`aiFolder`](#aifolder)). Relative paths only |

#### `folderMappings`

When a source repository does not use the default folder layout, configure custom paths for each content category. If omitted, the tool uses the standard category name as the folder path (e.g., `agents`, `hooks`, `instructions`, `plugins`, `prompts`, `skills`, `workflows`).

Each property in `folderMappings` corresponds to a content category:

| Property | Type | Description |
| --- | --- | --- |
| `agents` | `string \| null` | Path to agents content, `"root"`, or `null` to exclude |
| `hooks` | `string \| null` | Path to hooks content, `"root"`, or `null` to exclude |
| `instructions` | `string \| null` | Path to instructions content, `"root"`, or `null` to exclude |
| `plugins` | `string \| null` | Path to plugins content, `"root"`, or `null` to exclude |
| `prompts` | `string \| null` | Path to prompts content, `"root"`, or `null` to exclude |
| `skills` | `string \| null` | Path to skills content, `"root"`, or `null` to exclude |
| `workflows` | `string \| null` | Path to workflows content, `"root"`, or `null` to exclude |

**Special values:**

- `"root"` - The entire repository root is treated as the source for this category. When any category is set to `root`, all other categories are effectively disabled.
- `null` - The category is excluded entirely.
- *(omitted)* - Uses the default path (the category name).

**Example: Standard repository (no custom mappings needed)**

```json
{
  "sources": [
    {
      "owner": "github",
      "repo": "awesome-copilot"
    }
  ]
}
```

**Example: Repository with all prompts at its root**

```json
{
  "sources": [
    {
      "owner": "myorg",
      "repo": "copilot-prompts",
      "folderMappings": {
        "prompts": "root"
      }
    }
  ]
}
```

**Example: Repository with a custom directory structure**

```json
{
  "sources": [
    {
      "owner": "myorg",
      "repo": "copilot-config",
      "folderMappings": {
        "instructions": "copilot/instructions",
        "prompts": "copilot/prompts",
        "agents": "copilot/agents",
        "plugins": null,
        "skills": null
      }
    }
  ]
}
```

**Example: GitHub Enterprise repository**

```json
{
  "sources": [
    {
      "owner": "team",
      "repo": "copilot-tools",
      "label": "Internal Tools",
      "baseUrl": "https://github.example.com"
    }
  ]
}
```

**Example: Multiple sources**

```json
{
  "sources": [
    {
      "owner": "github",
      "repo": "awesome-copilot",
      "label": "Awesome Copilot"
    },
    {
      "owner": "myorg",
      "repo": "internal-prompts",
      "label": "internal",
      "folderMappings": {
        "prompts": "root"
      }
    }
  ]
}
```

---

### `defaultSourceIndex`

**Type:** `number`
**Default:** `0`

Index of the default source in the `sources` array (zero-based). Managed automatically by `--set-default`. Use `--list-source` to see current sources and their indices.

---

### `aiFolder`

**Type:** `string`
**Default:** `".github"`

The *A.I. folder*: the parent directory that category folders are created under when content is downloaded. Set it to target an editor or agent that reads its customizations from somewhere other than `.github`, such as `.claude` or `.copilot`.

```json
{
  "aiFolder": ".claude"
}
```

Managed by `--set-default folder=<path>`:

```bash
cmd-copilot-tools --set-default folder=.claude
```

```text
Default A.I. folder set to: .claude/
Tools now download to .claude/<category>/ instead of .github/<category>/.
```

`aiFolder` may also be set on an individual source, where it overrides this config-level value for that source only:

```json
{
  "aiFolder": ".claude",
  "sources": [
    {
      "owner": "acme-corp",
      "repo": "copilot-tools",
      "label": "acme",
      "aiFolder": "docs/ai"
    }
  ]
}
```

With the config above, tools from the `acme` source download to `docs/ai/<category>/` and tools from every other source download to `.claude/<category>/`.

**Resolution order**, highest precedence first:

| # | Source of the value | Scope | Absolute paths |
| --- | --- | --- | --- |
| 1 | `-f, --folder <path>` | This run only | Accepted |
| 2 | `aiFolder` on a source | That source, every run | Not accepted |
| 3 | `aiFolder` on the config | Every source, every run | Not accepted |
| 4 | `.github` | Built-in fallback | — |

Values are normalized before they are stored: surrounding whitespace and trailing separators are removed, so `" .claude/ "` is saved as `.claude`.

> **Note:** Both stored forms of `aiFolder` must be relative to the download directory. See [Absolute paths](#absolute-paths) below.

---

### `enterpriseToken`

**Type:** `string`
**Default:** `""`

Personal Access Token for authenticating with GitHub Enterprise Server. Required when browsing content from an Enterprise GitHub instance.

**Required token permissions:** `repo`, `read:org`, `read:user`

Create a token at: `https://your-github-enterprise.com/settings/tokens`

> **Note:** This token is stored in plaintext in the config file. For public GitHub, use the `GITHUB_TOKEN` environment variable instead, which takes priority.

---

### `cacheTimeout`

**Type:** `number`
**Default:** `3600000` (1 hour)

Duration (in milliseconds) to cache repository data before re-fetching from GitHub. Lower values provide fresher data but consume more API requests.

---

### `logLevel`

**Type:** `string`
**Default:** `"info"`
**Options:** `"error"`, `"warn"`, `"info"`, `"debug"`, `"trace"`

Controls the verbosity of log output.

| Level | Description |
| --- | --- |
| `error` | Only error messages |
| `warn` | Warnings and errors |
| `info` | Informational messages, warnings, and errors |
| `debug` | Debug information and all above |
| `trace` | All logging including detailed trace information |

---

### `checkForUpdates`

**Type:** `boolean`
**Default:** `true`

When enabled, the tool checks whether downloaded items have newer versions available in the source repository.

---

### `allowInsecureEnterpriseCerts`

**Type:** `boolean`
**Default:** `false`

> **Security Warning:** This setting disables TLS certificate validation for Enterprise GitHub
> servers only. Only enable for trusted enterprise environments with self-signed certificates.

When enabled, set `NODE_TLS_REJECT_UNAUTHORIZED=0` in your environment or configure this setting to accept self-signed certificates.

---

## Authentication

The command-line tool resolves GitHub authentication in this order:

1. `GITHUB_TOKEN` environment variable (recommended for public GitHub)
2. `enterpriseToken` in config file (for Enterprise GitHub)
3. Unauthenticated (60 requests/hour)

```bash
export GITHUB_TOKEN=ghp_your_token_here
cmd-copilot-tools
```

---

## Download Folder Structure

Downloaded content is saved to the current directory under the following paths, where `<ai-folder>` defaults to `.github`:

| Category | Local Path |
| --- | --- |
| Agents | `<ai-folder>/agents` |
| Cookbook | `<ai-folder>/cookbook` |
| Hooks | `<ai-folder>/hooks` |
| Instructions | `<ai-folder>/instructions` |
| Plugins | `<ai-folder>/plugins` |
| Prompts | `<ai-folder>/prompts` |
| Skills | `<ai-folder>/skills` |
| Workflows | `<ai-folder>/workflows` |

Folders are created automatically if they do not exist. The category subfolder names are fixed regardless of any custom `folderMappings` configured for the source repository. `folderMappings` only controls where content is fetched *from*, not where it is saved.

Only the parent folder is configurable, through [`aiFolder`](#aifolder) or the `-f, --folder` option.

---

## A.I. Folder Commands

| Command | Description |
| --- | --- |
| `--set-default folder=<path>` | Save `<path>` as the default A.I. folder. Relative paths only |
| `-f, --folder <path>` | Download into `<path>/<category>` for this run only. Accepts absolute paths |

### `--set-default folder=<path>`

`--set-default` reads its argument as an A.I. folder only when the argument begins with the exact qualifier `folder=`. Every other argument keeps the option's original meaning and sets the default download source.

| Command | Interpreted as |
| --- | --- |
| `--set-default folder=.claude` | Set the default A.I. folder to `.claude` |
| `--set-default myrepo` | Set the default source to the `myrepo` source |
| `--set-default folder` | Set the default source to a source labelled `folder` |
| `--set-default folders=.claude` | Set the default source (`folders=` is not the qualifier) |
| `--set-default Folder=.claude` | Set the default source (the qualifier is case-sensitive) |

```bash
# Changes the default source repo to download from
cmd-copilot-tools --set-default myrepo

# Now .claude/ is default and not .github/
cmd-copilot-tools --set-default folder=.claude
```

### `-f, --folder <path>`

Overrides the A.I. folder for a single run without changing anything on disk. It takes precedence over an `aiFolder` set on the source and over the saved config default.

```bash
cmd-copilot-tools --folder .copilot --skill my-skill
cmd-copilot-tools -f docs/ai --agent my-agent
```

The option also works with the interactive browser, where every download made during the session goes to the given folder:

```bash
cmd-copilot-tools --folder .claude
```

### Absolute paths

An absolute path is accepted **only** by `-f, --folder`:

```bash
cmd-copilot-tools --folder "C:\Users\demo-user\ai" --prompt my-prompt
cmd-copilot-tools --folder /opt/ai --prompt my-prompt
```

A stored default applies to every future run in every repository, so an absolute path passed to `--set-default folder=` is refused with a dedicated error rather than saved:

```console
$ cmd-copilot-tools --set-default folder=/opt/ai
Absolute path '/opt/ai' is not allowed when setting the default A.I. folder. The default
must be relative to the download directory (example: --set-default folder=.claude). To
download to an absolute path for a single run, use: --folder "/opt/ai"
```

The same rule applies to an `aiFolder` written directly into the config file. All of these forms count as absolute, on every platform:

| Form | Example |
| --- | --- |
| POSIX root | `/opt/ai` |
| Windows drive | `C:\ai`, `c:/ai`, `D:ai` |
| UNC share | `\\server\share\ai` |
| Home-anchored | `~`, `~/ai` |

Detection does not depend on the host platform: a Windows path is rejected on Linux and a POSIX path is rejected on Windows, so a config file shared between machines behaves the same way everywhere.

---

## Configuring Folder Mappings via CLI

When adding a repository that does not contain any of the standard category folders, the command-line tool prints the available top-level directories and shows the config file path so you can manually set `folderMappings`.

```bash
cmd-copilot-tools --source https://github.com/owner/non-standard-repo
```

Output example:

```text
Adding source: https://github.com/owner/non-standard-repo
Checking repository for standard folders...

No standard folders found. Available directories in repository root:
  - src
  - prompts-folder
  - custom-agents

Edit the config file to set folderMappings:
  ~/.config/cmd-git-copilot-tools/config.json
```

Then edit your config:

```json
{
  "sources": [
    {
      "owner": "owner",
      "repo": "non-standard-repo",
      "folderMappings": {
        "prompts": "prompts-folder",
        "agents": "custom-agents",
        "instructions": null,
        "plugins": null,
        "skills": null,
        "workflows": null
      }
    }
  ]
}
```

---

## Source Management Commands

| Command | Description |
| --- | --- |
| `--source <url> [label]` | Add a source repository |
| `--source:<map>=<val> <url> [label]` | Add a source with a folder mapping override |
| `--source:[m=v,...] <url> [label]` | Add a source with multiple folder mapping overrides |
| `--use <url\|label\|#>[/path]` | Use a source for this run only. Can reference by URL, label, or number from `--list-source` (e.g., `2` or `2/branch/tools`) |
| `--url <url>` | Use the url passed as a temp source for download |
| `--url:<map>=<val> <url>` | Use a temp source with a folder mapping override |
| `--url:[m=v,...] <url>` | Use a temp source with multiple folder mapping overrides |
| `--set-default <url\|label>` | Set the default source permanently |
| `--set-default folder=<path>` | Set the default A.I. folder permanently (see [A.I. Folder Commands](#ai-folder-commands)) |
| `--remove-source <url\|label>` | Remove a source |
| `--list-source` | List all configured sources (displays numbered list) |

### Examples

```bash
# List configured sources (shows numbered list)
cmd-copilot-tools --list-source
# Output:
# Configured sources:
#   1. https://github.com/github/awesome-copilot (GitHub Awesome Copilot) [default]
#   2. https://github.com/<userName>/awesome-copilot (userName)

# Use source by number
cmd-copilot-tools --use 2 --skill my-skill

# Use source by label
cmd-copilot-tools --use jhauga --skill my-skill

# Use source by number with appended path
cmd-copilot-tools --use 2/develop/custom-path --agent my-agent

# Use source by label with appended path
cmd-copilot-tools --use jhauga/develop/custom-path --agent my-agent

# Use --use or --url with the interactive browser
# The active source is shown at the top of the terminal UI
cmd-copilot-tools --use jhauga
# Shows: *** Using https://github.com/jhauga/awesome-copilot (jhauga) ***

cmd-copilot-tools --url https://github.com/owner/repo
# Shows: *** URL https://github.com/owner/repo ***
```

> **Note:** When `--use` references a source that is not configured, a `SourceNotFoundError` is thrown. Use `--list-source` to see available sources.

### Configuring Folder Mappings via CLI Arguments

Instead of manually editing the config file, you can set folder mappings directly from the command line using the config-argument syntax:

```bash
# Map a single category (--url for temp one-time use)
# Result: folderMappings = {skills: "root", agents: null, instructions: null, plugins: null, prompts: null, workflows: null}
cmd-copilot-tools --url:skills=root https://github.com/owner/repo --skill my-skill

# Map a single category to a custom path (others remain at default locations)
# Result: folderMappings = {plugins: "custom/path"}
cmd-copilot-tools --url:plugins="custom/path" https://github.com/owner/repo --plugin my-plugin

# Map multiple categories at once with bracket syntax
# Result: folderMappings = {plugins: "custom/path", instructions: "other/path"}
cmd-copilot-tools --url:[plugins="custom/path",instructions="other/path"] https://github.com/owner/repo

# Save a source with folder mappings (--source persists to config)
cmd-copilot-tools --source:skills=root https://github.com/owner/repo
cmd-copilot-tools --source:instructions="custom/path" https://github.com/owner/repo tool
cmd-copilot-tools --source:[plugins="custom/path",instructions="other/path"] https://github.com/owner/repo myrepo
```

#### Config-argument syntax

| Syntax | Description |
| --- | --- |
| `--url:<category>=<value>` | Set a single folder mapping for a temp source |
| `--url:[<cat1>=<val1>,<cat2>=<val2>]` | Set multiple folder mappings for a temp source |
| `--source:<category>=<value>` | Set a single folder mapping when adding a source |
| `--source:[<cat1>=<val1>,<cat2>=<val2>]` | Set multiple folder mappings when adding a source |

#### Valid categories

`agents`, `instructions`, `plugins`, `prompts`, `skills`, `workflows`

#### Valid values

| Value | Behavior |
| --- | --- |
| `"root"` | Entire repository root treated as this category; all other categories set to `null` |
| `"null"` | Exclude this category |
| `"path/to/folder"` | Custom folder path; unspecified categories keep their defaults |
