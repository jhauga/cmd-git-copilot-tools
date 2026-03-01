# ![icon](icon.png) CMD Git Copilot Tools

A command-line tool that allows you to browse, preview, and download GitHub Copilot customizations. The default repository is [github/awesome-copilot](https://github.com/github/awesome-copilot), but other repositories with Copilot `agent`, `instruction`, `plugin`, `prompt`, `skill`, and `workflow` tools can be used.

This tool is a command-line port of [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools). The core engine is host-agnostic and can be used as a backend for editor extensions — see [docs/api.md](docs/api.md).

## Install

```bash
npm install -g cmd-git-copilot-tools
```

Or run directly:

```bash
npx cmd-git-copilot-tools
```

## Features

- **Browse**: Explore agents, instructions, plugins, prompts, skills, and workflows in an interactive terminal list
- **Search**: Quickly find tools with real-time filtering across all categories
- **Download**: Save files to appropriate `.github/` folders in your current directory
- **Caching**: Smart caching for better performance
- **Multiple Sources**: Configure and switch between multiple GitHub repositories

## Quick Start

```bash
# Interactive browser (less-like terminal UI)
cmd-copilot-tools

# Show all categories pre-expanded
cmd-copilot-tools --all

# Browse only agents
cmd-copilot-tools --agent

# Download a specific prompt
cmd-copilot-tools --prompt my-prompt.prompt.md

# Search across all tools
cmd-copilot-tools --search copilot
```

## Interactive Terminal UI

When launched without arguments (or with `--all`), the tool opens an interactive terminal browser:

```text
[all] SHOW ALL
[a] Agents:
[i] Instructions:
[pl] Plugins:
[p] Prompts:
[s] Skills:
[w] Workflows:
------------------------------------------------------------
*** INSTRUCTIONS ***
Navigate with arrow keys or PgUp/PgDown.

q = Quit;  / = Start Search
[a], [i], [p], [pl], [s], [w] or [all] = Expand category
------------------------------------------------------------
>
```

Type a category label (e.g., `all` or `a`) and press Enter to expand:

```text
[a] Agents:
       1  my-agent.agent.md
       2  other-agent.agent.md

[p] Prompts:
       1  my-prompt.prompt.md
       2  other-prompt.prompt.md
------------------------------------------------------------
([a],[i],[p],[pl],[s],[w])[0-9]+ = Download (e.g. a1 for first agent)
q = Quit;  / = Search;  b = Back
------------------------------------------------------------
>
```

Type `a1` to download the first agent, `p2` for the second prompt, etc.

### Search

Type `/` to enter search mode, then type your query:

- `/copilot` — search all categories for "copilot"
- `/a:agent-name` — search only agents
- `/pl:plugin` — search only plugins

### Navigation

| Key | Action |
| --- | --- |
| ↑ / ↓ | Scroll list |
| PgUp / PgDn | Page through list |
| `all` + Enter | Show all categories |
| `a` + Enter | Show agents only |
| `i` + Enter | Show instructions only |
| `pl` + Enter | Show plugins only |
| `p` + Enter | Show prompts only |
| `s` + Enter | Show skills only |
| `w` + Enter | Show workflows only |
| `a1` + Enter | Download first agent (in all view) |
| `1` + Enter | Download first item (in single category view) |
| `/` | Start search |
| `b` | Back to category list |
| `q` | Quit |

## CLI Options

```sh
cmd-copilot-tools [options]
```

| Option | Description |
| --- | --- |
| *(no args)* | Launch interactive terminal browser |
| `--all` | Show all categories pre-expanded |
| `--agent [name,...]` | Show agents, or download named agent(s) |
| `--instruction [name,...]` | Show instructions, or download named instruction(s) |
| `--plugin [name,...]` | Show plugins, or download named plugin(s) |
| `--prompt [name,...]` | Show prompts, or download named prompt(s) |
| `--skill [name,...]` | Show skills, or download named skill(s) |
| `--workflow [name,...]` | Show workflows, or download named workflow(s) |
| `--search <term>[,term]` | Search tools (non-interactive output) |
| `--source <url> [label]` | Add a GitHub repository as a source |
| `--use <url\|label>` | Use a specific source for this run |
| `--set-default <url\|label>` | Set the default source permanently |
| `--remove-source <url\|label>` | Remove a configured source |
| `--list-source` | List all configured sources |
| `--test` | Run all tests (unit + integration) |
| `--test:<name>` | Run a specific suite: `search`, `config`, `download`, `full` |
| `--test:log` | Run all tests and save log to `logs/` |
| `--test:<name>:log` | Run specific suite and save log |
| `--log` | Save test log to `logs/` (requires `--test`) |
| `-h`, `--help`, `/?` | Show help |
| `-v`, `--version` | Show version |

## Download Folder Structure

Downloaded files are organized in your current directory as follows:

- **Agents** → `.github/agents/`
- **Instructions** → `.github/instructions/`
- **Plugins** → `.github/plugins/`
- **Prompts** → `.github/prompts/`
- **Skills** → `.github/skills/` *(entire folders with SKILL.md and supporting files)*
- **Workflows** → `.github/workflows/`

These folders are created automatically if they don't exist.

> **Note:** Skills and plugins are folder-based tools — downloading them copies the entire directory structure.

## Managing Sources

```bash
# Add a source repository
cmd-copilot-tools --source https://github.com/owner/repo

# Add with a label for easy reference
cmd-copilot-tools --source https://github.com/owner/repo myrepo

# Use a specific source for this run only
cmd-copilot-tools --use myrepo --prompt

# Set a source as the permanent default
cmd-copilot-tools --set-default myrepo

# List all configured sources
cmd-copilot-tools --list-source

# Remove a source
cmd-copilot-tools --remove-source myrepo
```

### Enterprise GitHub

For GitHub Enterprise, pass the full base URL:

```bash
cmd-copilot-tools --source https://github.example.com/owner/repo enterprise-tools
```

## Custom Folder Mappings

Not all source repositories follow the default `.github/{category}` folder structure. Configure custom mappings in the config file:

```json
{
  "sources": [
    {
      "owner": "myorg",
      "repo": "my-tools",
      "label": "My Tools",
      "folderMappings": {
        "prompts": "root",
        "agents": null,
        "instructions": null,
        "plugins": null,
        "skills": null,
        "workflows": null
      }
    }
  ]
}
```

| Value | Behavior |
| --- | --- |
| *(omitted)* | Uses the default category folder name |
| `"root"` | Entire repository root treated as this category |
| `null` | Category excluded entirely |
| `"custom/path"` | Custom folder path within the repository |

## Authentication

Set the `GITHUB_TOKEN` environment variable for authenticated API access:

```bash
export GITHUB_TOKEN=your_token_here
cmd-copilot-tools
```

| Auth Method | Rate Limit |
| --- | --- |
| No token (default) | 60 requests/hour |
| `GITHUB_TOKEN` env var | 5,000 requests/hour |

## Configuration Reference

Config file location:

- **Linux/macOS**: `~/.config/cmd-git-copilot-tools/config.json`
- **Windows**: `%APPDATA%\cmd-git-copilot-tools\config.json`

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `sources` | `array` | See defaults | GitHub repositories used as content sources |
| `defaultSourceIndex` | `number` | `0` | Index of the default source |
| `enterpriseToken` | `string` | `""` | Personal Access Token for GitHub Enterprise |
| `cacheTimeout` | `number` | `3600000` | Cache duration in ms (default: 1 hour) |
| `logLevel` | `string` | `"info"` | Log level: `error`, `warn`, `info`, `debug`, `trace` |
| `checkForUpdates` | `boolean` | `true` | Check for updates to downloaded items |
| `allowInsecureEnterpriseCerts` | `boolean` | `false` | Allow insecure TLS for Enterprise GitHub servers |

For full configuration details, see [docs/configuration.md](docs/configuration.md).

## Requirements

- Node.js 18 or higher
- Internet connection to fetch repository data

## Development

This command-line tool was built with:

- TypeScript
- Axios for HTTP requests
- ESBuild for bundling
- Node.js readline for interactive terminal UI

### Building

```bash
npm install
npm run compile
```

### Testing

Run the full test suite (unit tests + live integration test):

```bash
npm test
# or
cmd-copilot-tools --test
```

Run individual suites:

```bash
npm run test:search      # search/filter unit tests
npm run test:config      # config management unit tests
npm run test:download    # download path unit tests
npm run test:full        # live integration test (fetches from GitHub, downloads to OS temp)
```

Save results to a log file in `logs/`:

```bash
npm run test:log
npm run test:search:log
```

### Engine API

The `src/engine/` modules are host-agnostic and can be used as a backend for editor extensions or other tools. See [docs/api.md](docs/api.md) for the full engine API reference and a VS Code extension example.

**Enjoy browsing and using awesome GitHub Copilot customization tools!**

## License

MIT
