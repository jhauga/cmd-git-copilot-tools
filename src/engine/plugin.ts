import * as fs from 'fs';
import * as path from 'path';
import type { CopilotItem, RepositorySource, ToolCategory } from '../types.js';
import { GitHubApiError } from '../types.js';
import { downloadDirectory, downloadFile, ensureDir } from './download.js';
import type { DownloadOptions } from './download.js';
import { resolveAiFolder, resolveCategoryDir } from './folder.js';
import { getDirectoryContents, getFileContentByPath, listDirectoryTree } from './github.js';
import type { GitHubFileContent } from './github.js';

/**
 * Where a plugin folder keeps its manifest, in the order they are tried: the
 * Agent Plugins location at the folder root, then the earlier `.github/plugin/`.
 */
export const PLUGIN_MANIFEST_PATHS: readonly string[] = ['plugin.json', '.github/plugin/plugin.json'];

/** Namespace of an Agent Plugins manifest that lists a plugin's agents, skills, and hooks. */
export const AWESOME_COPILOT_NAMESPACE = 'com.github.awesome-copilot';

export type PluginItemKind = 'instruction' | 'prompt' | 'agent' | 'skill' | 'hook';

/** Tool type each plugin item kind downloads as. */
export const KIND_TO_CATEGORY: Record<PluginItemKind, ToolCategory> = {
  instruction: 'instructions',
  prompt: 'prompts',
  agent: 'agents',
  skill: 'skills',
  hook: 'hooks',
};

const PLUGIN_ITEM_KINDS: readonly string[] = Object.keys(KIND_TO_CATEGORY);

/** Agent Plugins composition fields and the item kind each one lists. */
const COMPOSITION_FIELDS: ReadonlyArray<readonly [string, PluginItemKind]> = [
  ['agents', 'agent'],
  ['skills', 'skill'],
  ['hooks', 'hook'],
];

/** Plugin subfolders copied into the local plugin folder along with its files. */
const PLUGIN_FOLDERS_COPIED: readonly string[] = ['agents', 'commands'];

export interface PluginItem {
  /** Repository path of the file or folder. */
  path: string;
  kind: PluginItemKind;
}

/**
 * Plugin manifest. Three layouts are read:
 *   - Agent Plugins: `plugin.json` at the plugin folder root, listing `agents`,
 *     `skills`, and `hooks` under `extensions["com.github.awesome-copilot"]`.
 *     Entries name repository content: `./agents/<name>.md` is
 *     `agents/<name>.agent.md`, `./skills/<name>/` is `skills/<name>`, and
 *     `./hooks/<name>/` is `hooks/<name>`.
 *   - plugin-relative: `agents`, `skills`, `instructions`, and `prompts`
 *     arrays of paths relative to the plugin folder (`./agents`, `./skills/name`)
 *   - legacy: an `items` array of `{ path, kind }` objects with repository paths
 * After parsing, `items` always holds the normalized list of repository paths.
 */
export interface PluginMetadata {
  $schema?: string;
  id?: string;
  name: string;
  description: string;
  version?: string;
  author?: { name: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  featured?: boolean;
  tags?: string[];
  keywords?: string[];
  agents?: string[];
  skills?: string[];
  instructions?: string[];
  prompts?: string[];
  /** Vendor sections of an Agent Plugins manifest, keyed by namespace. */
  extensions?: Record<string, unknown>;
  items?: PluginItem[];
  display?: {
    ordering?: 'alpha' | 'custom' | 'manual';
    show_badge?: boolean;
  };
}

export interface PluginParseResult {
  metadata: PluginMetadata;
  rawContent: string;
  /** Repository path the manifest was read from. */
  manifestPath: string;
}

export interface PluginDownloadResult {
  metadata: PluginMetadata;
  /** Folder that received the plugin's own files: its manifest, README, and other top-level files. */
  pluginDir: string;
  /** One entry per item written, as `kind: name`. */
  downloaded: string[];
  /** One entry per item that failed, as `path (reason)`. */
  failed: string[];
  /** Entries that are not downloaded, such as Copilot extensions, and problems copying the plugin's own files. */
  notices: string[];
  /** The plugin README, or an empty string when there is none. */
  readmeContent: string;
}

function invalid(detail: string): Error {
  return new Error(`Invalid plugin.json format: ${detail}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lastSegment(repoPath: string): string {
  return repoPath.split('/').pop() || repoPath;
}

function stringEntries(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
}

/** A manifest path without an extension in its last segment refers to a folder. */
function isDirectoryReference(repoPath: string): boolean {
  return !lastSegment(repoPath).includes('.');
}

/** Resolve a path relative to the plugin folder to a repository path. */
function resolveManifestPath(pluginDirPath: string, relPath: string): string {
  const stripped = relPath.startsWith('./') ? relPath.slice(2) : relPath;
  const trimmed = stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
  return `${pluginDirPath}/${trimmed}`;
}

function collectKind(target: PluginItem[], pluginDirPath: string, paths: unknown, kind: PluginItemKind): void {
  for (const relPath of stringEntries(paths)) {
    target.push({ path: resolveManifestPath(pluginDirPath, relPath), kind });
  }
}

/** The awesome-copilot section of an Agent Plugins manifest, when it is an object. */
function readNamespace(metadata: PluginMetadata): Record<string, unknown> | undefined {
  const section = metadata.extensions?.[AWESOME_COPILOT_NAMESPACE];
  return section && typeof section === 'object' && !Array.isArray(section)
    ? section as Record<string, unknown>
    : undefined;
}

/**
 * Repository path of an Agent Plugins composition entry, following the
 * awesome-copilot layout; undefined when the entry does not match it.
 */
function resolveCompositionEntry(kind: PluginItemKind, entry: string): string | undefined {
  const value = entry.trim();
  if (kind === 'agent') {
    const match = /^\.\/agents\/([^/]+)\.md$/.exec(value);
    return match ? `agents/${match[1]!.replace(/\.agent$/, '')}.agent.md` : undefined;
  }
  const folder = kind === 'skill' ? 'skills' : 'hooks';
  const match = new RegExp(`^\\./${folder}/([^/]+)/?$`).exec(value);
  return match ? `${folder}/${match[1]}` : undefined;
}

/**
 * Entries of an Agent Plugins manifest that `downloadPlugin` does not download,
 * each with the reason: Copilot extensions, and composition paths that do not
 * follow the awesome-copilot layout.
 */
export function getSkippedPluginEntries(metadata: PluginMetadata): string[] {
  const section = readNamespace(metadata);
  if (!section) {return [];}

  const skipped: string[] = [];
  for (const [field, kind] of COMPOSITION_FIELDS) {
    for (const entry of stringEntries(section[field])) {
      if (!resolveCompositionEntry(kind, entry)) {
        skipped.push(`${entry} (unrecognized ${field} path)`);
      }
    }
  }
  for (const entry of stringEntries(section['extensions'])) {
    skipped.push(`${entry} (Copilot extension, not downloaded)`);
  }
  return skipped;
}

/**
 * Parse and validate a manifest. `pluginDirPath` is the plugin folder's
 * repository path; it resolves plugin-relative item paths and supplies `id`
 * when the manifest has none.
 */
export function parsePluginMetadata(raw: string, pluginDirPath: string): PluginMetadata {
  let metadata: PluginMetadata;
  try {
    metadata = JSON.parse(raw) as PluginMetadata;
  } catch {
    throw invalid('not valid JSON');
  }

  if (!metadata || typeof metadata !== 'object') {
    throw invalid('metadata is missing or not an object');
  }
  if (typeof metadata.name !== 'string' || !metadata.name.trim()) {
    throw invalid('missing or invalid "name" field');
  }
  if (typeof metadata.description !== 'string' || !metadata.description.trim()) {
    throw invalid('missing or invalid "description" field');
  }

  const section = readNamespace(metadata);
  const hasRelativeFormat = Array.isArray(metadata.agents) || Array.isArray(metadata.skills) ||
    Array.isArray(metadata.instructions) || Array.isArray(metadata.prompts);
  const hasLegacyFormat = Array.isArray(metadata.items);

  if (!section && !hasRelativeFormat && !hasLegacyFormat) {
    throw invalid('missing or invalid "items" array');
  }

  if (!hasLegacyFormat) {
    const items: PluginItem[] = [];
    if (section) {
      for (const [field, kind] of COMPOSITION_FIELDS) {
        for (const entry of stringEntries(section[field])) {
          const repoPath = resolveCompositionEntry(kind, entry);
          if (repoPath) {
            items.push({ path: repoPath, kind });
          }
        }
      }
    }
    collectKind(items, pluginDirPath, metadata.agents, 'agent');
    collectKind(items, pluginDirPath, metadata.skills, 'skill');
    collectKind(items, pluginDirPath, metadata.instructions, 'instruction');
    collectKind(items, pluginDirPath, metadata.prompts, 'prompt');
    metadata.items = items;
  }

  metadata.items!.forEach((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') {
      throw invalid(`item at index ${index} is not an object`);
    }
    const candidate = item as Partial<PluginItem>;
    if (typeof candidate.path !== 'string' || !candidate.path.trim()) {
      throw invalid(`item at index ${index} is missing or has an invalid "path" field`);
    }
    if (typeof candidate.kind !== 'string' || !candidate.kind.trim()) {
      throw invalid(`item at index ${index} is missing or has an invalid "kind" field`);
    }
    if (!PLUGIN_ITEM_KINDS.includes(candidate.kind)) {
      throw invalid(
        `item at index ${index} has unsupported "kind" value "${candidate.kind}". ` +
        `Allowed kinds are: ${PLUGIN_ITEM_KINDS.join(', ')}`
      );
    }
  });

  if (!metadata.id || typeof metadata.id !== 'string') {
    metadata.id = lastSegment(pluginDirPath);
  }

  return metadata;
}

/**
 * Fetch and parse the manifest of the plugin folder at `pluginDirPath`,
 * trying each of `PLUGIN_MANIFEST_PATHS` in turn. A failing GitHub response
 * other than "not found" is thrown as is; a missing or invalid manifest is
 * reported as `Failed to parse plugin.json: <detail>`.
 */
export async function parsePluginJson(
  repo: RepositorySource,
  pluginDirPath: string,
  token?: string
): Promise<PluginParseResult> {
  let file: GitHubFileContent | undefined;
  let manifestPath = '';
  for (const relativePath of PLUGIN_MANIFEST_PATHS) {
    manifestPath = `${pluginDirPath}/${relativePath}`;
    try {
      file = await getFileContentByPath(repo, manifestPath, token);
      break;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {continue;}
      throw error;
    }
  }

  if (!file) {
    throw new Error(
      `Failed to parse plugin.json: no manifest in '${pluginDirPath}' (looked for ${PLUGIN_MANIFEST_PATHS.join(', ')})`
    );
  }

  try {
    return { metadata: parsePluginMetadata(file.content, pluginDirPath), rawContent: file.content, manifestPath };
  } catch (error) {
    throw new Error(`Failed to parse plugin.json: ${messageOf(error)}`);
  }
}

/** Download every file below `repoPath` flat into `destDir`; returns the number of files written. */
async function downloadFlat(repo: RepositorySource, repoPath: string, destDir: string, token?: string): Promise<number> {
  const entries = await listDirectoryTree(repo, repoPath, token);
  ensureDir(destDir);
  let written = 0;
  for (const entry of entries) {
    if (entry.type === 'file' && entry.download_url) {
      await downloadFile(entry.download_url, path.join(destDir, entry.name), token);
      written++;
    }
  }
  return written;
}

/**
 * Download a plugin item by item. Each agent, skill, hook, instruction, and
 * prompt the manifest lists lands in its own category folder, and the
 * plugin's manifest, top-level files, `agents/`, and `commands/` are copied
 * into `plugins/<id>/`. One failing item does not stop the others.
 */
export async function downloadPlugin(
  item: CopilotItem,
  destDir: string,
  token?: string,
  options: DownloadOptions = {}
): Promise<PluginDownloadResult> {
  if (item.category !== 'plugins' || item.file.type !== 'dir') {
    throw new Error(`'${item.name}' is not a plugin folder.`);
  }

  const { metadata, rawContent, manifestPath } = await parsePluginJson(item.repo, item.file.path, token);
  const aiFolder = resolveAiFolder({
    cliFolder: options.folderOverride,
    source: item.repo,
    config: { aiFolder: options.configFolder },
  });

  const downloaded: string[] = [];
  const failed: string[] = [];
  const notices = getSkippedPluginEntries(metadata);

  for (const pluginItem of metadata.items ?? []) {
    try {
      const categoryDir = resolveCategoryDir(destDir, KIND_TO_CATEGORY[pluginItem.kind], aiFolder);
      ensureDir(categoryDir);
      const name = lastSegment(pluginItem.path);

      if (pluginItem.kind === 'skill' || pluginItem.kind === 'hook') {
        const folder = path.join(categoryDir, name);
        fs.rmSync(folder, { recursive: true, force: true });
        const count = await downloadDirectory(item.repo, pluginItem.path, folder, token);
        downloaded.push(`${pluginItem.kind}: ${name} (${count} files)`);
      } else if (isDirectoryReference(pluginItem.path)) {
        const count = await downloadFlat(item.repo, pluginItem.path, categoryDir, token);
        downloaded.push(`${pluginItem.kind}: ${name}/ (${count} files)`);
      } else {
        const file = await getFileContentByPath(item.repo, pluginItem.path, token);
        fs.writeFileSync(path.join(categoryDir, name), file.content, 'utf-8');
        downloaded.push(`${pluginItem.kind}: ${name}`);
      }
    } catch (error) {
      failed.push(`${pluginItem.path} (${messageOf(error)})`);
    }
  }

  // The manifest keeps its place in the plugin folder
  const pluginDir = path.join(resolveCategoryDir(destDir, 'plugins', aiFolder), metadata.id ?? item.name);
  const manifestTarget = path.join(pluginDir, ...manifestPath.slice(item.file.path.length + 1).split('/'));
  ensureDir(path.dirname(manifestTarget));
  fs.writeFileSync(manifestTarget, rawContent, 'utf-8');

  let readmeContent = '';
  try {
    const topLevel = await getDirectoryContents(item.repo, item.file.path, token);
    for (const entry of topLevel) {
      try {
        if (entry.type === 'file' && entry.download_url && entry.path !== manifestPath) {
          const content = await downloadFile(entry.download_url, path.join(pluginDir, entry.name), token);
          if (entry.name === 'README.md') {readmeContent = content;}
        } else if (entry.type === 'dir' && PLUGIN_FOLDERS_COPIED.includes(entry.name)) {
          await downloadDirectory(item.repo, entry.path, path.join(pluginDir, entry.name), token);
        }
      } catch (error) {
        notices.push(`${entry.name} (${messageOf(error)})`);
      }
    }
  } catch (error) {
    notices.push(`plugin folder listing (${messageOf(error)})`);
  }

  return { metadata, pluginDir, downloaded, failed, notices, readmeContent };
}
