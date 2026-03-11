# ![icon](https://raw.githubusercontent.com/jhauga/cmd-git-copilot-tools/refs/heads/main/icon.png) CMD Git Copilot Tools

- `ctrl + click` for full [documentation](https://jhauga.github.io/cmd-git-copilot-tools/index.html)

A command-line tool that allows you to browse, preview, and download GitHub Copilot customizations. The default repository is [github/awesome-copilot](https://github.com/github/awesome-copilot), but other repositories with Copilot `agent`, `instruction`, `plugin`, `prompt`, `skill`, and `workflow` tools can be used.

This tool is a command-line port of [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools). The core engine is host-agnostic and can be used as a backend for editor extensions — see [docs/api.md](docs/api.md).

## Install

### As a CLI tool

```bash
npm install -g cmd-git-copilot-tools
```

Or run directly:

```bash
npx cmd-git-copilot-tools
```

### As a library

```bash
npm install cmd-git-copilot-tools
```

## Features

- **Browse**: Explore agents, instructions, plugins, prompts, skills, and workflows in an interactive terminal list
- **Search**: Quickly find tools with real-time filtering across all categories
- **Download**: Save files to appropriate `.github/` folders in your current directory
- **Caching**: Smart caching for better performance
- **Multiple Sources**: Configure and switch between multiple GitHub repositories
- **Programmatic API**: Use as a library in Node.js/TypeScript projects with full type safety

## Quick Start

```bash
# Interactive browser (less-like terminal UI)
cmd-copilot-tools

# Show all categories pre-expanded
cmd-copilot-tools --all

# Browse only agents
cmd-copilot-tools --agent

# Download a specific prompt (extension optional)
cmd-copilot-tools --prompt my-prompt.prompt.md
cmd-copilot-tools --prompt my-prompt

# Download across multiple categories in one command
cmd-copilot-tools --skill quasi-coder --instruction html-css-style-color-guide,update-code-from-shorthand

# If a name is not found it is reported at the end instead of aborting
cmd-copilot-tools --prompt my-prompt --instruction existing-one,missing-one

# Search across all tools (results grouped by source)
cmd-copilot-tools --search copilot
```

## Programmatic Usage

In addition to the CLI, you can use `cmd-git-copilot-tools` as a library in your Node.js or TypeScript projects:

```bash
npm install cmd-git-copilot-tools
```

### Example: Fetch and Search Tools

```javascript
import {
  loadConfig,
  fetchAllToolsFromSources,
  searchTools,
  filterByCategory,
  downloadItem,
} from 'cmd-git-copilot-tools';

// Load configuration
const config = loadConfig();

// Fetch all tools from configured sources
const allTools = await fetchAllToolsFromSources(
  config.sources,
  config.enterpriseToken
);

// Search for specific tools
const results = searchTools(allTools, 'agent');
console.log(`Found ${results.length} tools matching "agent"`);

// Filter by category
const agents = filterByCategory(allTools, 'agents');
console.log(`Total agents: ${agents.length}`);

// Download a specific item
if (agents.length > 0) {
  await downloadItem(agents[0], process.cwd());
  console.log(`Downloaded: ${agents[0].name}`);
}
```

### Example: Parse GitHub URLs

```javascript
import {
  parseGitHubUrl,
  addSource,
  loadConfig,
  saveConfig,
} from 'cmd-git-copilot-tools';

// Parse a GitHub repository URL
const parsed = parseGitHubUrl('https://github.com/owner/repo');
console.log(parsed); // { owner: 'owner', repo: 'repo' }

// Add a new source programmatically
const config = loadConfig();
addSource(config, 'https://github.com/myorg/my-tools', 'My Tools');
saveConfig(config);
```

### TypeScript Support

The package includes TypeScript definitions for full type safety:

```typescript
import type {
  Config,
  RepositorySource,
  CopilotItem,
  ToolCategory,
} from 'cmd-git-copilot-tools';

const config: Config = loadConfig();
const category: ToolCategory = 'prompts';
```

For a complete API reference and examples, see [docs/api.md](docs/api.md).

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

When launched with `--use` or `--url`, the active source is displayed at the top:

```text
*** Using https://github.com/owner/repo (myrepo) ***
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

With `--url` (temporary source):

```text
*** URL https://github.com/owner/repo ***
[all] SHOW ALL
...
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
| `--agent [name,...]` | Show agents, or download named agent(s). Extension (`.agent.md`) is optional |
| `--instruction [name,...]` | Show instructions, or download named instruction(s). Extension (`.instructions.md`) is optional |
| `--plugin [name,...]` | Show plugins, or download named plugin(s) |
| `--prompt [name,...]` | Show prompts, or download named prompt(s). Extension (`.prompt.md`) is optional |
| `--skill [name,...]` | Show skills, or download named skill(s) |
| `--workflow [name,...]` | Show workflows, or download named workflow(s). Extension (`.workflow.md`) is optional |
| `--search <term>[,term]` | Search tools (non-interactive output) |
| `--source <url> [label]` | Add a GitHub repository as a source |
| `--source:<map>=<val> <url> [label]` | Add a source with a folder mapping override |
| `--source:[m=v,...] <url> [label]` | Add a source with multiple folder mapping overrides |
| `--use <url\|label\|#>[/path]` | Use a specific source for this run. Can be a URL, label, or number from `--list-source` (e.g., `2` or `2/branch/tools`) |
| `--url <url>` | Use the url passed as a temp source for download |
| `--url:<map>=<val> <url>` | Use a temp source with a folder mapping override |
| `--url:[m=v,...] <url>` | Use a temp source with multiple folder mapping overrides |
| `--set-default <url\|label>` | Set the default source permanently |
| `--remove-source <url\|label>` | Remove a configured source |
| `--list-source` | List all configured sources |
| `--test` | Run all tests (unit + integration) |
| `--test:<name>` | Run a specific suite: `search`, `config`, `download`, `cli`, `permissions`, `programmatic`, `full` |
| `--test:log` | Run all tests and save log to `logs/` |
| `--test:<name>:log` | Run specific suite and save log |
| `--log` | Save test log to `logs/` (requires `--test`) |
| `--permission` | Show current permission status |
| `--permission on` | Enable GitHub authentication (prompts on first use or after builds) |
| `--permission off` | Disable GitHub authentication (uses unauthenticated 60 req/hr) |
| `--permission always` | Enable GitHub authentication permanently (no prompts after builds) |
| `-h`, `--help`, `/?` | Show help |
| `-v`, `--version` | Show version |

### Multi-category downloads

Multiple category flags can be combined in a single command. All requested categories are fetched in one network round-trip:

```bash
cmd-copilot-tools --skill quasi-coder --instruction html-css-style-color-guide,update-code-from-shorthand
```

Behaviour when combining flags:

- **Category with names** — each name is downloaded; files not found are reported as a notice at the end (the rest still download).
- **Category without names** — the category is skipped and a notice is printed at the end. Use the flag alone (e.g. `--instruction`) to open the interactive browser for that category.

```text
Notices:
  --prompt: no names provided, skipped (use --prompt alone to browse interactively)
  Tool 'bad-name' not found. Use --search to find available tools.
```

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

# List all configured sources (shows numbered list)
cmd-copilot-tools --list-source

# Use a specific source by number (from --list-source)
cmd-copilot-tools --use 2 --prompt

# Use a specific source by label
cmd-copilot-tools --use myrepo --prompt

# Use a specific source with an appended path (works with numbers or labels)
cmd-copilot-tools --use myrepo/develop/tools --prompt
cmd-copilot-tools --use 2/develop/tools --prompt

# Use a URL as a temporary source (without saving to config)
cmd-copilot-tools --url https://github.com/owner/repo --agent my-agent
cmd-copilot-tools --url https://github.com/owner/repo

# Use --use or --url with the interactive browser (source shown in header)
cmd-copilot-tools --use myrepo
cmd-copilot-tools --url https://github.com/owner/repo

# Use a temp URL with folder mapping overrides
cmd-copilot-tools --url:skills=root https://github.com/owner/repo --skill my-skill
cmd-copilot-tools --url:plugins="custom/path" https://github.com/owner/repo --plugin my-plugin
cmd-copilot-tools --url:[plugins="path",instructions="path"] https://github.com/owner/repo

# Add a source with folder mappings
cmd-copilot-tools --source:skills=root https://github.com/owner/repo
cmd-copilot-tools --source:instructions="custom/path" https://github.com/owner/repo tool

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

On the first run (any command other than `--help`), the tool shows a one-time
permission prompt explaining GitHub token resolution and asking whether to allow
authenticated API access. You can respond with `y` for one-time approval (will
re-prompt after builds), or `always` to enable permanently without future prompts.

You can also manage this at any time:

```bash
# Check current permission status
cmd-copilot-tools --permission

# Enable GitHub authentication (re-prompts after builds)
cmd-copilot-tools --permission on

# Disable GitHub authentication (reverts to 60 req/hr)
cmd-copilot-tools --permission off

# Enable authentication permanently (no prompts after npm run compile)
cmd-copilot-tools --permission always
```

Token resolution order when authentication is enabled (first match wins):

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable
3. `gh` CLI stored credentials — run `gh auth login` once

| Auth state | Rate limit |
| --- | --- |
| Disabled or no token found | 60 requests/hour |
| Enabled (any token source) | 5,000 requests/hour |

**No credentials are stored by this tool.** Only a boolean permission flag is
saved to disk. See [docs/permissions.md](docs/permissions.md) for full details.

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
- Node.js native `fetch` API for HTTP requests
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
