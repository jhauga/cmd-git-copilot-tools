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

#### `folderMappings`

When a source repository does not use the default folder layout, configure custom paths for each content category. If omitted, the tool uses the standard category name as the folder path (e.g., `agents`, `instructions`, `plugins`, `prompts`, `skills`, `workflows`).

Each property in `folderMappings` corresponds to a content category:

| Property | Type | Description |
| --- | --- | --- |
| `agents` | `string \| null` | Path to agents content, `"root"`, or `null` to exclude |
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

Downloaded content is saved to the current directory under the following paths:

| Category | Local Path |
| --- | --- |
| Agents | `.github/agents` |
| Instructions | `.github/instructions` |
| Plugins | `.github/plugins` |
| Prompts | `.github/prompts` |
| Skills | `.github/skills` |
| Workflows | `.github/workflows` |

Folders are created automatically if they do not exist. The local save paths are fixed regardless of any custom `folderMappings` configured for the source repository. `folderMappings` only controls where content is fetched *from*, not where it is saved.

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
| `--use <url\|label>` | Use a source for this run only |
| `--set-default <url\|label>` | Set the default source permanently |
| `--remove-source <url\|label>` | Remove a source |
| `--list-source` | List all configured sources |
