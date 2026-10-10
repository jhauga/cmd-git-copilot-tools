import * as path from 'path';
import type { CopilotItem, FolderMappingValue } from '../types.js';

/**
 * Normalize one folder of an array mapping to a repository-relative path.
 *
 * Backslashes count as separators, and empty and `.` segments are dropped, so
 * `"."`, `"/"`, `"./"`, and `""` all collapse to `""` (the repository root) and
 * `"./web/"` becomes `"web"`.
 */
export function normalizeMappedFolder(folder: string): string {
  return folder
    .trim()
    .split(/[\\/]+/)
    .filter(segment => segment !== '' && segment !== '.')
    .join('/');
}

/**
 * Folders of an array mapping, normalized and de-duplicated, in configured
 * order. Returns `null` when the mapping is not an array. Non-string entries
 * in a hand-edited config file are ignored.
 */
export function getMappedFolders(mapping: FolderMappingValue | undefined): string[] | null {
  if (!Array.isArray(mapping)) {return null;}

  const folders: string[] = [];
  for (const entry of mapping) {
    if (typeof entry !== 'string') {continue;}
    const folder = normalizeMappedFolder(entry);
    if (!folders.includes(folder)) {folders.push(folder);}
  }
  return folders;
}

export interface ToolReference {
  /** Folder before the last separator, normalized (`''` is the root). Undefined for a bare name. */
  folder?: string;
  name: string;
}

/**
 * Split a requested tool name into an optional folder and the tool name.
 *   - `"my-skill"`      → `{ name: "my-skill" }`
 *   - `"web/my-skill"`  → `{ folder: "web", name: "my-skill" }`
 *   - `"./my-skill"`    → `{ folder: "", name: "my-skill" }` (repository root)
 */
export function parseToolReference(raw: string): ToolReference {
  const value = raw.trim().replace(/\\/g, '/');
  const slash = value.lastIndexOf('/');
  if (slash === -1) {
    return { name: value };
  }
  return {
    folder: normalizeMappedFolder(value.slice(0, slash)),
    name: value.slice(slash + 1).trim(),
  };
}

/** Format a folder and tool name as a reference that resolves back to it. */
export function formatToolReference(folder: string, name: string): string {
  return folder === '' ? `./${name}` : `${folder}/${name}`;
}

/** Repository folder an item was listed from (`''` for the root). */
export function getItemFolder(item: CopilotItem): string {
  return item.mappedFolder ?? normalizeMappedFolder(path.posix.dirname(item.file.path));
}

/**
 * Name shown in listings. Items from an array mapping show `folder/name` so the
 * listed text can be passed straight back as a folder-qualified download name.
 */
export function getItemDisplayName(item: CopilotItem): string {
  return item.mappedFolder ? `${item.mappedFolder}/${item.name}` : item.name;
}
