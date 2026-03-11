# Engine API Guide

`cmd-git-copilot-tools` is structured as a modular engine with a thin CLI layer on top. The engine modules have no dependency on the terminal UI or Node.js stdin/stdout, which means they can be imported and used as the backend for an editor extension, a language server, a web service, or any other host that needs to fetch and download GitHub Copilot customizations.

This tool was ported from [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools), a VS Code extension with the same goals. The engine API design is based on that extension's internal logic, extracted and generalized so it can power any host — including a new editor extension.

---

## Architecture

```text
src/
├── engine/           ← Host-agnostic API layer (no UI, no process.stdout)
│   ├── config.ts     ← JSON config management
│   ├── github.ts     ← GitHub REST API client
│   ├── cache.ts      ← In-memory TTL cache
│   ├── download.ts   ← File and directory download
│   └── search.ts     ← Search, filter, and selection helpers
├── ui/               ← Terminal UI (CLI-specific, not part of the API)
│   ├── renderer.ts
│   ├── input.ts
│   └── terminal.ts
└── cli.ts            ← CLI entry point
```

The `engine/` modules are the API. The `ui/` modules and `cli.ts` are the CLI host. An editor extension would replace the `ui/` and `cli.ts` layers with its own host-specific UI.

---

## Using the Engine

### Installation

Install the package as a dependency of your extension:

```bash
npm install cmd-git-copilot-tools
```

Then import from the main package export:

```typescript
import {
  loadConfig,
  findSource,
  fetchAllToolsFromSources,
  getToken,
  searchTools,
  filterByCategory,
  downloadItem,
} from 'cmd-git-copilot-tools';

// TypeScript types are also exported
import type {
  Config,
  RepositorySource,
  CopilotItem,
  ToolCategory,
} from 'cmd-git-copilot-tools';
```

> **Note:** All engine modules are exported from the main package entry point with full TypeScript type definitions.

---

## Module Reference

### `engine/config.ts` — Configuration Management

Manages the JSON config file at `~/.config/cmd-git-copilot-tools/config.json` (Windows: `%APPDATA%\cmd-git-copilot-tools\config.json`).

```typescript
import {
  loadConfig,       // Read config from disk (returns defaults if not found)
  saveConfig,       // Write config to disk
  getDefaultConfig, // Get a fresh default config object
  addSource,        // Add a GitHub repository source
  removeSource,     // Remove a source by URL or label
  setDefaultSource, // Set which source is the default
  findSource,       // Look up a source by URL or label
  listSources,      // Print configured sources to stdout
  parseGitHubUrl,   // Parse a GitHub URL into owner/repo/branch/baseUrl
  getConfigPath,    // Get the absolute path to the config file
} from 'cmd-git-copilot-tools';

// Example: load config and find a source
const config = loadConfig();
const source = findSource(config, 'github/awesome-copilot');
```

#### `Config` type

```typescript
interface Config {
  sources: RepositorySource[];
  defaultSourceIndex: number;
  enterpriseToken?: string;
  cacheTimeout: number;            // milliseconds, default 3600000 (1 hour)
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  checkForUpdates: boolean;
  allowInsecureEnterpriseCerts: boolean;
}
```

#### `RepositorySource` type

```typescript
interface RepositorySource {
  owner: string;
  repo: string;
  label?: string;
  baseUrl?: string;      // GitHub Enterprise base URL
  branch?: string;
  folderMappings?: {     // Custom folder-to-category mappings
    agents?: string | 'root' | null;
    instructions?: string | 'root' | null;
    plugins?: string | 'root' | null;
    prompts?: string | 'root' | null;
    skills?: string | 'root' | null;
    workflows?: string | 'root' | null;
  };
}
```

---

### `engine/github.ts` — GitHub API Client

Fetches tool listings from GitHub repository contents API. Handles auth, caching, rate limits, and custom Enterprise URLs.

```typescript
import {
  fetchAllToolsFromSources, // Fetch all categories from one or more sources
  fetchCategory,            // Fetch a single category from a source
  getToken,                 // Resolve auth token (env var → config → undefined)
  fetchDirectoryTree,       // List entries in a repository folder
} from 'cmd-git-copilot-tools/src/engine/github.js';

// Example: fetch all tools
const config = loadConfig();
const token = getToken(undefined, config.enterpriseToken);
const items = await fetchAllToolsFromSources(config.sources, token, config.cacheTimeout);
```

#### `CopilotItem` type

```typescript
interface CopilotItem {
  id: string;
  name: string;
  category: 'agents' | 'instructions' | 'plugins' | 'prompts' | 'skills' | 'workflows';
  repo: RepositorySource;
  file: {
    name: string;
    path: string;
    type: 'file' | 'dir';
    download_url: string | null;
    size: number;
    sha: string;
  };
  content?: string;
}
```

#### Authentication

Token resolution order:

1. `GITHUB_TOKEN` environment variable (5,000 req/hr)
2. `config.enterpriseToken` from config file (for Enterprise GitHub)
3. Unauthenticated (60 req/hr)

---

### `engine/search.ts` — Search and Filter

Pure functions for searching and selecting items from a `CopilotItem[]` list.

```typescript
import {
  searchTools,       // Search items by query string (supports category prefixes)
  filterByCategory,  // Filter to a single category
  groupByCategory,   // Group items into a Map<ToolCategory, CopilotItem[]>
  groupBySource,     // Group items by repository source
  findByCode,        // Resolve a download code ('a1', 'pl2', '3') to an item
} from 'cmd-git-copilot-tools/src/engine/search.js';

// Examples
const agents = filterByCategory(items, 'agents');
const results = searchTools(items, 'a:copilot');   // agents matching 'copilot'
const all = searchTools(items, 'copilot');          // all categories
const item = findByCode(items, 'a1', 'all');        // first agent in 'all' view
```

#### Search query syntax

| Query | Matches |
| --- | --- |
| `copilot` | All items with "copilot" in name or path |
| `a:copilot` | Agents only |
| `pl:plugin-name` | Plugins only |
| `term1,term2` | Union: items matching term1 OR term2 |

#### Category label map

| Label | Category |
| --- | --- |
| `a` | `agents` |
| `i` | `instructions` |
| `pl` | `plugins` |
| `p` | `prompts` |
| `s` | `skills` |
| `w` | `workflows` |

---

### `engine/download.ts` — File Download

Downloads items to a target directory, preserving the `.github/{category}/` folder structure.

```typescript
import {
  downloadItem,         // Download a single CopilotItem (file or directory)
  downloadItemsByName,  // Download items matched by name from a list
  downloadFile,         // Download a raw URL to a specific path
  getFileSizeDisplay,   // Format bytes as '1.5KB', '2.0MB', etc.
} from 'cmd-git-copilot-tools/src/engine/download.js';

// Example: download an item into the current workspace folder
const meta = await downloadItem(item, workspaceFolder, token);
console.log(`Saved to: ${meta.localPath}`);
```

#### Download paths

| Category | Saved to (relative to `destDir`) |
| --- | --- |
| `agents` | `.github/agents/<name>` |
| `instructions` | `.github/instructions/<name>` |
| `plugins` | `.github/plugins/<name>/` *(directory)* |
| `prompts` | `.github/prompts/<name>` |
| `skills` | `.github/skills/<name>/` *(directory)* |
| `workflows` | `.github/workflows/<name>` |

Skills and plugins are folder-based tools — the entire directory is downloaded recursively.

#### `DownloadMetadata` type

```typescript
interface DownloadMetadata {
  itemId: string;
  itemName: string;
  category: ToolCategory;
  repoOwner: string;
  repoName: string;
  downloadTimestamp: number;
  sha: string;
  size: number;
  downloadUrl: string;
  localPath: string;       // Absolute path where the item was saved
}
```

---

### `engine/cache.ts` — In-Memory Cache

A singleton TTL cache keyed by repository and path. Used internally by `github.ts` but accessible if you need to control caching behavior.

```typescript
import { cache } from 'cmd-git-copilot-tools/src/engine/cache.js';

cache.clear();                // Clear all cached data
cache.clearRepo(source);      // Clear cache for a specific repository source
```

---

## Building an Editor Extension

The following example shows how a VS Code extension could use the engine as its backend, replacing the terminal UI with VS Code's tree view, quick pick, and progress APIs.

```typescript
import * as vscode from 'vscode';
import { loadConfig } from 'cmd-git-copilot-tools/src/engine/config.js';
import { fetchAllToolsFromSources, getToken } from 'cmd-git-copilot-tools/src/engine/github.js';
import { filterByCategory, searchTools } from 'cmd-git-copilot-tools/src/engine/search.js';
import { downloadItem } from 'cmd-git-copilot-tools/src/engine/download.js';
import type { CopilotItem } from 'cmd-git-copilot-tools/src/types.js';

export async function activate(context: vscode.ExtensionContext) {
  const config = loadConfig();
  const token = getToken(undefined, config.enterpriseToken);

  // Fetch all tools once (cached for cacheTimeout ms)
  const items = await fetchAllToolsFromSources(config.sources, token, config.cacheTimeout);

  // Show a quick pick to search and select a tool
  context.subscriptions.push(
    vscode.commands.registerCommand('myExtension.downloadTool', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Search tools' });
      if (!query) { return; }

      const results = searchTools(items, query);
      const picks = results.map(item => ({
        label: item.name,
        description: item.category,
        item,
      }));

      const selected = await vscode.window.showQuickPick(picks, { matchOnDescription: true });
      if (!selected) { return; }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Downloading ${selected.item.name}` },
        async () => {
          const meta = await downloadItem(selected.item, workspaceFolder, token);
          vscode.window.showInformationMessage(`Downloaded to ${meta.localPath}`);
        }
      );
    })
  );
}
```

> **Note:** This engine was designed to be host-agnostic. The VS Code extension
> [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools) was the original implementation that this CLI tool was ported from. It was not built using this engine, but a future VS Code extension *could* use this engine as its backend, as shown above.

---

## Types Reference

All shared types are in `src/types.ts`:

```typescript
import type {
  ToolCategory,        // 'agents' | 'instructions' | 'plugins' | 'prompts' | 'skills' | 'workflows'
  RepositorySource,    // Config entry for a GitHub repository
  GitHubFileEntry,     // Raw GitHub API file/directory entry
  CopilotItem,         // A fetchable/downloadable tool
  DownloadMetadata,    // Result of a download operation
  Config,              // Full config file shape
  FolderMappings,      // Custom folder-to-category mapping config
  // Error types:
  ToolNotFoundError,
  SourceNotFoundError,
  InvalidUrlError,
  OnlyOneSourceError,
  MissingArgumentError,
  // Constants:
  CATEGORY_LABELS,     // Record<string, ToolCategory>
  CATEGORY_DISPLAY,    // Record<ToolCategory, { label, title }>
  ORDERED_CATEGORIES,  // ToolCategory[] in display order
  DOWNLOAD_PATHS,      // Record<ToolCategory, string> — relative .github/ paths
} from 'cmd-git-copilot-tools/src/types.js';
```

---

## Origin

This engine is a port of the core logic from [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools), a VS Code extension for browsing and downloading GitHub Copilot customizations. The engine was extracted, generalized, and restructured as a standalone module so it can be used in any host environment.
