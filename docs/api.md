# Engine API Guide

`cmd-git-copilot-tools` is structured as a modular engine with a thin CLI layer on top. The engine modules have no dependency on the terminal UI or Node.js stdin/stdout, which means they can be imported and used as the backend for an editor extension, a language server, a web service, or any other host that needs to fetch and download GitHub Copilot customizations.

This tool began as a port of [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools), a VS Code extension with the same goals, and is now that extension's upstream engine. The extension depends on this package for fetching, searching, folder mapping, and downloading, and keeps only its host-specific views, settings, and authentication.

---

## Architecture

```text
src/
├── engine/           ← Host-agnostic API layer (no UI, no process.stdout)
│   ├── config.ts     ← JSON config management
│   ├── github.ts     ← GitHub REST API client
│   ├── cache.ts      ← In-memory TTL cache
│   ├── download.ts   ← File and directory download
│   ├── folder.ts     ← A.I. folder resolution for download paths
│   ├── mapping.ts    ← Array folder mappings and folder/name references
│   ├── plugin.ts     ← Plugin manifests and item-by-item plugin downloads
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
  setDefaultFolder, // Set the default A.I. folder (rejects absolute paths)
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
  aiFolder?: string;               // Default A.I. folder, default '.github'
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
    agents?: FolderMappingValue;
    cookbook?: FolderMappingValue;
    hooks?: FolderMappingValue;
    instructions?: FolderMappingValue;
    plugins?: FolderMappingValue;
    prompts?: FolderMappingValue;
    skills?: FolderMappingValue;
    workflows?: FolderMappingValue;
  };
  aiFolder?: string;     // A.I. folder for this source (relative paths only)
}

// One folder, the whole root, several folders searched in order, or excluded
type FolderMappingValue = string | 'root' | string[] | null;
```

An array value spreads a category across several folders. `"."` or `"/"` in the array is the repository root. See [`engine/mapping.ts`](#enginemappingts--folder-mappings) for how items from an array mapping are listed and resolved.

---

### `engine/github.ts` — GitHub API Client

Fetches tool listings from GitHub repository contents API. Handles auth, caching, rate limits, and custom Enterprise URLs.

```typescript
import {
  fetchAllToolsFromSources, // Fetch all categories from one or more sources
  fetchCategory,            // Fetch a single category from a source
  getToken,                 // Resolve auth token (see Authentication below)
  fetchDirectoryTree,       // List entries in a repository folder
  getDirectoryContents,     // List one level of a repository folder (cached)
  listDirectoryTree,        // List a folder and every subfolder, flattened
  getFileContentByPath,     // Read one file by repository path
  pathExists,               // Whether a repository path exists
  configureRequests,        // Set the request timeout and enterprise TLS handling
} from 'cmd-git-copilot-tools';

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
  category: 'agents' | 'cookbook' | 'hooks' | 'instructions' | 'plugins' | 'prompts' | 'skills' | 'workflows';
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
  mappedFolder?: string;  // Folder listed from, for array mappings ('' = root)
}
```

For a category mapped to an array of folders, `fetchCategory` lists every folder in the configured order and sets `mappedFolder` on each item. Items from single-path mappings leave it unset.

#### Authentication

Token resolution order for `getToken`:

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable
3. The GitHub CLI token (`gh auth token`), when `gh` is installed and signed in
4. `config.enterpriseToken`, for a source with a `baseUrl` (GitHub Enterprise)
5. Unauthenticated

Authenticated requests are limited to 5,000 per hour; unauthenticated requests are limited to 60 per hour.

#### Errors

Every failing GitHub response is thrown as a `GitHubApiError`:

```typescript
class GitHubApiError extends Error {
  status: number;                // HTTP status
  url: string;                   // request URL
  rateLimitRemaining?: number;   // from x-ratelimit-remaining, when sent
  rateLimitReset?: Date;         // from x-ratelimit-reset, when sent
  readonly isRateLimit: boolean; // 429, or 403 with no requests remaining
}
```

`fetchCategory` and `fetchAllTools` treat a 404 as an empty category. A host that shows its own sign-in or rate-limit prompts switches on `status` and `isRateLimit`:

```typescript
try {
  items = await fetchCategory(source, 'skills', token);
} catch (error) {
  if (error instanceof GitHubApiError && error.isRateLimit) {
    showRateLimitNotice(error.rateLimitReset);
  } else if (error instanceof GitHubApiError && (error.status === 401 || error.status === 403)) {
    promptForSignIn();
  } else {
    throw error;
  }
}
```

#### Request options

```typescript
configureRequests({
  timeoutMs: 10000,                   // per request, default 15000
  allowInsecureEnterpriseCerts: true, // skip certificate validation for enterprise hosts
});
```

The options apply to every later request in the process. With `allowInsecureEnterpriseCerts` on, requests to hosts other than `github.com` and its subdomains go through an `undici` agent that does not validate certificates. Requests to `github.com` always validate.

#### Reading single paths

```typescript
const file = await getFileContentByPath(source, 'plugins/sample-plugin/README.md', token);
file.content;  // decoded text
file.sha;      // blob sha

await pathExists(source, 'skills/my-skill/SKILL.md', token);      // true or false; other failures throw
const tree = await listDirectoryTree(source, 'skills/my-skill', token); // entries of every level
```

---

### `engine/search.ts` — Search and Filter

Pure functions for searching and selecting items from a `CopilotItem[]` list.

```typescript
import {
  searchTools,       // Search items by query string (supports category prefixes)
  filterByCategory,  // Filter to a single category
  groupByCategory,   // Group items into a Map<ToolCategory, CopilotItem[]>
  findByCode,        // Resolve a download code ('a1', 'pl2', '3') to an item
} from 'cmd-git-copilot-tools';

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
| `ck` | `cookbook` |
| `h` | `hooks` |
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
  resolveItemsByName,   // Resolve one name or folder/name to the items it would download
  downloadFile,         // Download a raw URL to a specific path
  downloadDirectory,    // Download a repository folder recursively; returns the file count
  getFileSizeDisplay,   // Format bytes as '1.5KB', '2.0MB', etc.
} from 'cmd-git-copilot-tools';

// Example: download an item into the current workspace folder
const meta = await downloadItem(item, workspaceFolder, token);
console.log(`Saved to: ${meta.localPath}`);

// Example: download into a custom A.I. folder instead of .github
const custom = await downloadItem(item, workspaceFolder, token, {
  folderOverride: '.claude',
});

// Example: save under a name the user chose
const renamed = await downloadItem(item, workspaceFolder, token, {
  targetName: 'team-review.prompt.md',
});
```

#### `DownloadOptions` type

Both `downloadItem` and `downloadItemsByName` accept an optional fourth argument controlling which A.I. folder the content lands in and what it is called.

```typescript
interface DownloadOptions {
  folderOverride?: string;  // Highest precedence; may be an absolute path
  configFolder?: string;    // Config-level default (config.aiFolder)
  targetName?: string;      // File or folder name to write, instead of item.name
}
```

Omit the folder options and the item's own source is consulted, then the built-in `.github` default. `targetName` must be a single name: a value with a path separator or a `..` segment throws before anything is fetched. `DownloadMetadata.itemName` keeps the item's own name; `localPath` reflects the name written.

#### Resolving names

`downloadItemsByName` resolves each requested name with `resolveItemsByName`, which accepts two forms:

| Name | Matches |
| --- | --- |
| `my-skill` | The tool in any folder. Items keep folder-mapping order, so the first folder that holds it wins |
| `backend/my-skill` | The tool only in the `backend` folder (`./my-skill` for the repository root) |

```typescript
const skills = filterByCategory(items, 'skills');

resolveItemsByName(skills, 'my-skill');          // first folder that has it
resolveItemsByName(skills, 'backend/my-skill');  // backend only
```

When nothing matches, a bare name from a source without array mappings throws an `Error` with the original message. Every other miss throws a `MappedToolNotFoundError`, which carries `toolName`, `folder`, `searchedFolders`, and `foundIn` (the `folder/name` references where the tool does exist).

#### Download paths

| Category | Saved to (relative to `destDir`) |
| --- | --- |
| `agents` | `<ai-folder>/agents/<name>` |
| `cookbook` | `<ai-folder>/cookbook/<name>` |
| `hooks` | `<ai-folder>/hooks/<name>/` *(directory)* |
| `instructions` | `<ai-folder>/instructions/<name>` |
| `plugins` | `<ai-folder>/plugins/<name>/` *(directory)* |
| `prompts` | `<ai-folder>/prompts/<name>` |
| `skills` | `<ai-folder>/skills/<name>/` *(directory)* |
| `workflows` | `<ai-folder>/workflows/<name>` |

`<ai-folder>` defaults to `.github`. An absolute A.I. folder replaces `destDir` entirely rather than resolving beneath it.

Skills, plugins, and hooks are folder-based tools — the entire directory is downloaded recursively.

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

### `engine/folder.ts` — A.I. Folder Resolution

Resolves which A.I. folder a download lands in, and composes the destination directory for a category.

```typescript
import {
  isAbsolutePath,     // Platform-independent absolute path check
  normalizeAiFolder,  // Trim and strip trailing separators; empty falls back to '.github'
  resolveAiFolder,    // Apply the precedence rules below
  resolveCategoryDir, // Compose destDir + A.I. folder + category
} from 'cmd-git-copilot-tools';

const folder = resolveAiFolder({
  cliFolder: options.folder,   // 1. -f, --folder
  source,                      // 2. source.aiFolder
  config,                      // 3. config.aiFolder
});                            // 4. '.github'

const dir = resolveCategoryDir(workspaceFolder, 'skills', folder);
```

`isAbsolutePath` recognizes POSIX roots (`/opt/ai`), Windows drive paths (`C:\ai`), UNC shares (`\\server\share`), and home-anchored paths (`~/ai`) regardless of the platform it runs on. `setDefaultFolder` uses it to reject absolute values with an `AbsoluteFolderPathError`; only `folderOverride` accepts them.

---

### `engine/mapping.ts` — Folder Mappings

Pure helpers for array folder mappings and folder-qualified tool names.

```typescript
import {
  normalizeMappedFolder, // './frontend/' → 'frontend'; '.', '/', './' → '' (root)
  getMappedFolders,      // Array mapping → normalized, de-duplicated folders; otherwise null
  resolveCategoryPaths,  // Repository paths a tool type is listed from, in search order
  parseToolReference,    // 'backend/my-skill' → { folder: 'backend', name: 'my-skill' }
  formatToolReference,   // ('backend', 'my-skill') → 'backend/my-skill'; ('', 'my-skill') → './my-skill'
  getItemFolder,         // Folder an item was listed from ('' = root)
  getItemDisplayName,    // 'backend/my-skill' for array-mapped items, otherwise the plain name
} from 'cmd-git-copilot-tools';

getMappedFolders(['frontend', './frontend', 'backend', '.']); // ['frontend', 'backend', '']
getMappedFolders('custom/path');                             // null

resolveCategoryPaths({}, 'agents');                                           // ['agents']
resolveCategoryPaths({ folderMappings: { skills: 'root' } }, 'skills');       // ['']
resolveCategoryPaths({ folderMappings: { skills: ['web', '.'] } }, 'skills'); // ['web', '']
resolveCategoryPaths({ folderMappings: { agents: null } }, 'agents');         // []
```

When an array includes the root, the root listing skips entries named after the other folders in the same array, so they are not listed as tools. A mapping that is an empty string means the default folder for that tool type.

---

### `engine/plugin.ts` - Plugins

A plugin is a folder whose manifest, `.github/plugin/plugin.json`, lists the agents, skills, instructions and prompts it bundles. `downloadItem` copies a plugin folder as it is; `downloadPlugin` reads the manifest and places each item in its own category folder.

```typescript
import {
  parsePluginMetadata,       // Validate a manifest string; both layouts normalize to items[]
  parsePluginJson,           // Fetch and parse the manifest of a plugin folder
  downloadPlugin,            // Download a plugin item by item
  KIND_TO_CATEGORY,          // { instruction: 'instructions', prompt: 'prompts', agent: 'agents', skill: 'skills' }
  PLUGIN_JSON_RELATIVE_PATH, // '.github/plugin/plugin.json'
} from 'cmd-git-copilot-tools';

const { metadata } = await parsePluginJson(source, 'plugins/sample-plugin', token);
metadata.items; // [{ path: 'plugins/sample-plugin/agents', kind: 'agent' }, ...]

const result = await downloadPlugin(pluginItem, workspaceFolder, token);
result.downloaded;    // ['agent: agents/ (2 files)', 'skill: my-skill (3 files)']
result.failed;        // ['plugins/sample-plugin/prompts/missing.prompt.md (Path ... not found ...)']
result.notices;       // problems copying the plugin's own files, if any
result.pluginDir;     // <workspace>/.github/plugins/sample-plugin
result.readmeContent; // the plugin README, or ''
```

Manifest layouts:

| Layout | Shape |
| --- | --- |
| Current | `agents`, `skills`, `instructions` and `prompts` arrays of paths relative to the plugin folder (`./agents`, `./skills/name`) |
| Legacy | an `items` array of `{ path, kind }` objects with repository paths |

After parsing, `items` always holds the normalized list and `id` falls back to the plugin folder name. A manifest without a name, a description, or any item list throws an `Error` whose message starts with `Invalid plugin.json format`; `parsePluginJson` prefixes it with `Failed to parse plugin.json:` and lets a `GitHubApiError` through unchanged.

What `downloadPlugin` writes, relative to the A.I. folder:

| Item | Destination |
| --- | --- |
| `agent`, `instruction` or `prompt` file | `<category>/<file name>` |
| `agent`, `instruction` or `prompt` folder reference (no extension) | every file below it, flat, into `<category>/` |
| `skill` | `skills/<folder name>/`, replaced whole |
| the plugin's own `agents/`, `commands/` and `README.md` | `plugins/<id>/` |
| the manifest | `plugins/<id>/.github/plugin/plugin.json` |

One failing item does not stop the others; it is reported in `failed`.

---

### `engine/cache.ts` — In-Memory Cache

A singleton TTL cache keyed by repository and path. Used internally by `github.ts` but accessible if you need to control caching behavior.

```typescript
import { cache } from 'cmd-git-copilot-tools';

cache.clear();                       // Clear all cached data
cache.clearRepo(source);             // Clear cache for a specific repository source
cache.clearCategory(source, 'skills'); // Clear every folder the category is listed from
```

---

## Building an Editor Extension

The following example shows how a VS Code extension could use the engine as its backend, replacing the terminal UI with VS Code's tree view, quick pick, and progress APIs.

```typescript
import * as vscode from 'vscode';
import { GitHubApiError, downloadItem, fetchAllToolsFromSources, searchTools } from 'cmd-git-copilot-tools';
import type { RepositorySource } from 'cmd-git-copilot-tools';

export async function activate(context: vscode.ExtensionContext) {
  // Sources and cache lifetime come from the extension's own settings
  const settings = vscode.workspace.getConfiguration('myExtension');
  const sources = settings.get<RepositorySource[]>('repositories', []);
  const cacheTimeout = settings.get<number>('cacheTimeout', 3600000);

  // The token comes from VS Code's GitHub sign-in (undefined when signed out)
  const session = await vscode.authentication.getSession('github', ['repo'], { silent: true });
  const token = session?.accessToken;

  // Fetch all tools once (cached for cacheTimeout ms)
  const items = await fetchAllToolsFromSources(sources, token, cacheTimeout);

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

      // Let the user rename the file before it is written
      const targetName = await vscode.window.showInputBox({ prompt: 'Save as', value: selected.item.name });
      if (!targetName) { return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Downloading ${selected.item.name}` },
        async () => {
          try {
            const meta = await downloadItem(selected.item, workspaceFolder, token, { targetName });
            vscode.window.showInformationMessage(`Downloaded to ${meta.localPath}`);
          } catch (error) {
            if (error instanceof GitHubApiError && (error.status === 401 || error.status === 403)) {
              vscode.window.showErrorMessage('Sign in to GitHub to download from this repository.');
              return;
            }
            throw error;
          }
        }
      );
    })
  );
}
```

> **Note:** This is the integration pattern the [Git Copilot Tools](https://github.com/jhauga/vscode-git-copilot-tools)
> VS Code extension uses. Host concerns such as settings, sign-in, and progress UI stay in the extension, while fetching, searching, and downloading come from this package. Inside an extension host, pass sources and the token in explicitly instead of calling `loadConfig` or `getToken`: `loadConfig` reads the command-line tool's per-user config file, and `getToken` reads environment variables and runs the `gh` CLI.

---

## Types Reference

All shared types are in `src/types.ts`:

```typescript
import type {
  ToolCategory,        // 'agents' | 'cookbook' | 'hooks' | 'instructions' | 'plugins' | 'prompts' | 'skills' | 'workflows'
  RepositorySource,    // Config entry for a GitHub repository
  GitHubFileEntry,     // Raw GitHub API file/directory entry
  CopilotItem,         // A fetchable/downloadable tool
  DownloadMetadata,    // Result of a download operation
  Config,              // Full config file shape
  FolderMappings,      // Custom folder-to-category mapping config
  FolderMappingValue,  // string | 'root' | string[] | null
  GitHubFileContent,   // One file read by path: content, download_url, sha, size
  RequestOptions,      // configureRequests() argument: timeoutMs, allowInsecureEnterpriseCerts
  PluginMetadata,      // Parsed plugin manifest
  PluginItem,          // One manifest entry: path and kind
  PluginItemKind,      // 'instruction' | 'prompt' | 'agent' | 'skill'
  PluginParseResult,   // metadata plus the raw manifest text
  PluginDownloadResult, // What downloadPlugin wrote, failed on, and read
  // Error types:
  GitHubApiError,
  ToolNotFoundError,
  MappedToolNotFoundError,
  SourceNotFoundError,
  InvalidUrlError,
  OnlyOneSourceError,
  MissingArgumentError,
  AbsoluteFolderPathError,
  // Constants:
  CATEGORY_LABELS,     // Record<string, ToolCategory>
  CATEGORY_DISPLAY,    // Record<ToolCategory, { label, title }>
  ORDERED_CATEGORIES,  // ToolCategory[] in display order
  DOWNLOAD_PATHS,      // Record<ToolCategory, string> — default .github/ paths
  DEFAULT_AI_FOLDER,   // '.github'
  KIND_TO_CATEGORY,    // Record<PluginItemKind, ToolCategory>
  PLUGIN_JSON_RELATIVE_PATH, // '.github/plugin/plugin.json'
} from 'cmd-git-copilot-tools';
```

---

## Origin and Consumers

This engine began as a port of the core logic from [jhauga/vscode-git-copilot-tools](https://github.com/jhauga/vscode-git-copilot-tools), a VS Code extension for browsing and downloading GitHub Copilot customizations. The engine was extracted, generalized, and restructured as a standalone module so it can be used in any host environment.

The extension has since adopted this package as a dependency, which makes this repository the single source of truth for the shared logic. Fixes and features are released here once and reach the extension through a dependency update. Changes to the extension's own interface, such as views, commands, and settings, are still made in the extension.
