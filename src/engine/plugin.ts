import * as fs from 'fs';
import * as path from 'path';
import type { CopilotItem, RepositorySource, ToolCategory } from '../types.js';
import { GitHubApiError } from '../types.js';
import { downloadDirectory, downloadFile, ensureDir } from './download.js';
import type { DownloadOptions } from './download.js';
import { resolveAiFolder, resolveCategoryDir } from './folder.js';
import { getDirectoryContents, getFileContent, getFileContentByPath, listDirectoryTree } from './github.js';

/** Where a plugin keeps its manifest, relative to the plugin folder. */
export const PLUGIN_JSON_RELATIVE_PATH = '.github/plugin/plugin.json';

export type PluginItemKind = 'instruction' | 'prompt' | 'agent' | 'skill';

/** Tool type each plugin item kind downloads as. */
export const KIND_TO_CATEGORY: Record<PluginItemKind, ToolCategory> = {
  instruction: 'instructions',
  prompt: 'prompts',
  agent: 'agents',
  skill: 'skills',
};

const PLUGIN_ITEM_KINDS: readonly string[] = Object.keys(KIND_TO_CATEGORY);

export interface PluginItem {
  /** Repository path of the file or folder. */
  path: string;
  kind: PluginItemKind;
}

/**
 * Plugin manifest. Two layouts are read:
 *   - current: `agents`, `skills`, `instructions` and `prompts` arrays of
 *     paths relative to the plugin folder (`./agents`, `./skills/name`)
 *   - legacy:  an `items` array of `{ path, kind }` objects
 * After parsing, `items` always holds the normalized list.
 */
export interface PluginMetadata {
  id?: string;
  name: string;
  description: string;
  version?: string;
  author?: { name: string };
  repository?: string;
  license?: string;
  featured?: boolean;
  tags?: string[];
  keywords?: string[];
  agents?: string[];
  skills?: string[];
  instructions?: string[];
  prompts?: string[];
  items?: PluginItem[];
  display?: {
    ordering?: 'alpha' | 'custom' | 'manual';
    show_badge?: boolean;
  };
}

export interface PluginParseResult {
  metadata: PluginMetadata;
  rawContent: string;
}

export interface PluginDownloadResult {
  metadata: PluginMetadata;
  /** Folder that received the plugin's own files: manifest, agents/, commands/, README.md. */
  pluginDir: string;
  /** One entry per item written, as `kind: name`. */
  downloaded: string[];
  /** One entry per item that failed, as `path (reason)`. */
  failed: string[];
  /** Problems copying the plugin's own files; the items above are unaffected. */
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

/** A manifest path without an extension in its last segment refers to a folder. */
function isDirectoryReference(repoPath: string): boolean {
  return !lastSegment(repoPath).includes('.');
}

/** Resolve a manifest path relative to the plugin folder to a repository path. */
function resolveManifestPath(pluginDirPath: string, relPath: string): string {
  const stripped = relPath.startsWith('./') ? relPath.slice(2) : relPath;
  const trimmed = stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
  return `${pluginDirPath}/${trimmed}`;
}

function collectKind(target: PluginItem[], pluginDirPath: string, paths: unknown, kind: PluginItemKind): void {
  if (!Array.isArray(paths)) {return;}
  for (const relPath of paths) {
    if (typeof relPath === 'string' && relPath.trim()) {
      target.push({ path: resolveManifestPath(pluginDirPath, relPath), kind });
    }
  }
}

/**
 * Parse and validate a manifest. `pluginDirPath` is the plugin folder's
 * repository path; it resolves relative item paths and supplies `id` when the
 * manifest has none.
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

  const hasCurrentFormat = Array.isArray(metadata.agents) || Array.isArray(metadata.skills) ||
    Array.isArray(metadata.instructions) || Array.isArray(metadata.prompts);
  const hasLegacyFormat = Array.isArray(metadata.items);

  if (!hasCurrentFormat && !hasLegacyFormat) {
    throw invalid('missing or invalid "items" array');
  }

  if (hasCurrentFormat && !hasLegacyFormat) {
    const items: PluginItem[] = [];
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
 * Fetch and parse the manifest of the plugin folder at `pluginDirPath`.
 * A failing GitHub response is thrown as is; a manifest problem is reported
 * as `Failed to parse plugin.json: <detail>`.
 */
export async function parsePluginJson(
  repo: RepositorySource,
  pluginDirPath: string,
  token?: string
): Promise<PluginParseResult> {
  try {
    const file = await getFileContentByPath(repo, `${pluginDirPath}/${PLUGIN_JSON_RELATIVE_PATH}`, token);
    return { metadata: parsePluginMetadata(file.content, pluginDirPath), rawContent: file.content };
  } catch (error) {
    if (error instanceof GitHubApiError) {throw error;}
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
 * Download a plugin item by item. Each agent, skill, instruction and prompt
 * the manifest lists lands in its own category folder, and the plugin's
 * manifest, `agents/`, `commands/` and `README.md` are copied into
 * `plugins/<id>/`. One failing item does not stop the others.
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

  const { metadata } = await parsePluginJson(item.repo, item.file.path, token);
  const aiFolder = resolveAiFolder({
    cliFolder: options.folderOverride,
    source: item.repo,
    config: { aiFolder: options.configFolder },
  });

  const downloaded: string[] = [];
  const failed: string[] = [];
  const notices: string[] = [];

  for (const pluginItem of metadata.items ?? []) {
    try {
      const categoryDir = resolveCategoryDir(destDir, KIND_TO_CATEGORY[pluginItem.kind], aiFolder);
      ensureDir(categoryDir);
      const name = lastSegment(pluginItem.path);

      if (pluginItem.kind === 'skill') {
        const skillDir = path.join(categoryDir, name);
        fs.rmSync(skillDir, { recursive: true, force: true });
        const count = await downloadDirectory(item.repo, pluginItem.path, skillDir, token);
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

  const pluginDir = path.join(resolveCategoryDir(destDir, 'plugins', aiFolder), metadata.id ?? item.name);
  const manifestPath = path.join(pluginDir, PLUGIN_JSON_RELATIVE_PATH);
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(metadata, null, 2), 'utf-8');

  let readmeContent = '';
  try {
    const topLevel = await getDirectoryContents(item.repo, item.file.path, token);

    for (const folderName of ['agents', 'commands']) {
      const folder = topLevel.find(entry => entry.type === 'dir' && entry.name === folderName);
      if (!folder) {continue;}
      try {
        await downloadDirectory(item.repo, folder.path, path.join(pluginDir, folderName), token);
      } catch (error) {
        notices.push(`${folderName}/ (${messageOf(error)})`);
      }
    }

    const readme = topLevel.find(entry => entry.type === 'file' && entry.name === 'README.md');
    if (readme?.download_url) {
      try {
        readmeContent = await getFileContent(readme.download_url, token);
        fs.writeFileSync(path.join(pluginDir, 'README.md'), readmeContent, 'utf-8');
      } catch (error) {
        notices.push(`README.md (${messageOf(error)})`);
      }
    }
  } catch (error) {
    notices.push(`plugin folder listing (${messageOf(error)})`);
  }

  return { metadata, pluginDir, downloaded, failed, notices, readmeContent };
}
