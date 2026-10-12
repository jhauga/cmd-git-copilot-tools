import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CopilotItem, DownloadMetadata, GitHubFileEntry, RepositorySource } from '../types.js';
import { MappedToolNotFoundError } from '../types.js';
import { resolveAiFolder, resolveCategoryDir } from './folder.js';
import { getDirectoryContents, getFileContent } from './github.js';
import { formatToolReference, getItemDisplayName, getItemFolder, parseToolReference } from './mapping.js';

export interface DownloadOptions {
  /** `-f, --folder` value. Bypasses the source and config defaults. */
  folderOverride?: string;
  /** Config-level default A.I. folder (`--set-default folder=<path>`). */
  configFolder?: string;
  /**
   * File or folder name written under the category directory, in place of
   * the item name. A single name only: separators and `..` are rejected.
   */
  targetName?: string;
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveTargetName(item: CopilotItem, targetName?: string): string {
  if (targetName === undefined) {return item.name;}
  const name = targetName.trim();
  if (name === '' || name === '.' || name === '..' || /[\\/]/.test(name)) {
    throw new Error(`Invalid download name '${targetName}': it must be a single file or folder name.`);
  }
  return name;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function downloadFile(
  downloadUrl: string,
  destPath: string,
  token?: string
): Promise<string> {
  const content = await getFileContent(downloadUrl, token);
  ensureDir(path.dirname(destPath));
  const fileData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(destPath, fileData, 'utf-8');
  return fileData;
}

/** Download a repository folder and its subfolders into `destDir`; returns the number of files written. */
export async function downloadDirectory(
  repo: RepositorySource,
  repoPath: string,
  destDir: string,
  token?: string
): Promise<number> {
  const entries = await getDirectoryContents(repo, repoPath, token);
  ensureDir(destDir);

  let written = 0;
  for (const entry of entries) {
    const entryDest = path.join(destDir, entry.name);
    if (entry.type === 'dir') {
      written += await downloadDirectory(repo, entry.path, entryDest, token);
    } else if (entry.type === 'file' && entry.download_url) {
      await downloadFile(entry.download_url, entryDest, token);
      written++;
    }
  }
  return written;
}

export async function downloadItem(
  item: CopilotItem,
  destDir: string,
  token?: string,
  options: DownloadOptions = {}
): Promise<DownloadMetadata> {
  const aiFolder = resolveAiFolder({
    cliFolder: options.folderOverride,
    source: item.repo,
    config: { aiFolder: options.configFolder },
  });
  const targetBase = resolveCategoryDir(destDir, item.category, aiFolder);
  const localPath = path.join(targetBase, resolveTargetName(item, options.targetName));

  let contentForHash: string;

  if (item.file.type === 'dir') {
    // Skills, plugins, and hooks: download entire directory
    await downloadDirectory(item.repo, item.file.path, localPath, token);
    // Use path as hash source for directories
    contentForHash = item.file.path + item.file.sha;
  } else {
    // Regular files
    if (!item.file.download_url) {
      throw new Error(`No download URL for '${item.name}'`);
    }
    contentForHash = await downloadFile(item.file.download_url, localPath, token);
  }

  const metadata: DownloadMetadata = {
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    repoOwner: item.repo.owner,
    repoName: item.repo.repo,
    downloadTimestamp: Date.now(),
    sha: sha256(contentForHash),
    size: item.file.size,
    downloadUrl: item.file.download_url ?? '',
    localPath,
  };

  return metadata;
}

export function matchesToolName(itemName: string, rawName: string): boolean {
  const normalized = rawName.toLowerCase().trim();
  const name = itemName.toLowerCase();
  return (
    name === normalized ||
    name === normalized + '.md' ||
    name.replace(/\.(agents?|instructions?|prompts?|workflows?)\.md$/, '') === normalized ||
    name.replace(/\.md$/, '') === normalized
  );
}

/** Folders of array-mapped items, in the order they were listed. */
function listMappedFolders(items: CopilotItem[]): string[] {
  const folders: string[] = [];
  for (const item of items) {
    if (item.mappedFolder !== undefined && !folders.includes(item.mappedFolder)) {
      folders.push(item.mappedFolder);
    }
  }
  return folders;
}

/**
 * Resolve one requested name to the items it downloads.
 *
 *   - `name`         matches the tool in any folder. Items are listed in folder
 *                    mapping order, so for a tool type mapped to an array of
 *                    folders the first folder that holds the tool wins.
 *   - `folder/name`  matches the tool only in that folder (`./name` for the
 *                    repository root).
 *
 * One item is returned per distinct tool name. Throws when nothing matches.
 */
export function resolveItemsByName(items: CopilotItem[], rawName: string): CopilotItem[] {
  const ref = parseToolReference(rawName);
  if (ref.name === '') {
    throw new Error(`'${rawName}' is missing a tool name after the folder.`);
  }

  const byName = items.filter(item => matchesToolName(item.name, ref.name));
  const requestedFolder = ref.folder?.toLowerCase();
  const matching = requestedFolder === undefined
    ? byName
    : byName.filter(item => getItemFolder(item).toLowerCase() === requestedFolder);

  if (matching.length === 0) {
    const searched = listMappedFolders(items);
    if (ref.folder === undefined && searched.length === 0) {
      throw new Error(`Tool '${rawName}' not found. Use --search to find available tools.`);
    }
    const foundIn = Array.from(new Set(byName.map(item => formatToolReference(getItemFolder(item), item.name))));
    throw new MappedToolNotFoundError(ref.name, searched, ref.folder, foundIn);
  }

  const seen = new Set<string>();
  return matching.filter(item => {
    if (seen.has(item.name)) { return false; }
    seen.add(item.name);
    return true;
  });
}

export async function downloadItemsByName(
  items: CopilotItem[],
  names: string[],
  destDir: string,
  token?: string,
  options: DownloadOptions = {}
): Promise<DownloadMetadata[]> {
  const results: DownloadMetadata[] = [];

  for (const rawName of names) {
    for (const match of resolveItemsByName(items, rawName)) {
      const meta = await downloadItem(match, destDir, token, options);
      results.push(meta);
      console.log(`Downloaded: ${getItemDisplayName(match)} → ${meta.localPath}`);
    }
  }

  return results;
}

export function getFileSizeDisplay(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
