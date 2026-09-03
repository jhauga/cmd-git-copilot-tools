import * as os from 'os';
import * as path from 'path';
import type { Config, RepositorySource, ToolCategory } from '../types.js';
import { DEFAULT_AI_FOLDER } from '../types.js';

/**
 * Detect an absolute path regardless of the host platform.
 *
 * Node's path.isAbsolute() only understands the conventions of the platform it
 * runs on, so a Windows path checked on Linux (or a POSIX path checked on
 * Windows) slips through. The A.I. folder value travels through config files
 * that are edited by hand and shared between machines, so both conventions are
 * rejected everywhere.
 */
export function isAbsolutePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {return false;}

  // POSIX root ("/tools") and Windows UNC share ("\\\\server\\share")
  if (/^[/\\]/.test(trimmed)) {return true;}

  // Windows drive letter: "C:\tools", "c:/tools", "C:tools"
  if (/^[a-zA-Z]:/.test(trimmed)) {return true;}

  // Home-anchored paths resolve outside the download directory
  if (trimmed === '~' || /^~[/\\]/.test(trimmed)) {return true;}

  return false;
}

/**
 * Trim an A.I. folder value and strip trailing separators.
 * An empty or whitespace-only value falls back to the default folder.
 */
export function normalizeAiFolder(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/[/\\]+$/, '');
  return trimmed === '' ? DEFAULT_AI_FOLDER : trimmed;
}

/** Expand a leading `~` to the current user's home directory. */
function expandHome(folder: string): string {
  if (folder === '~') {return os.homedir();}
  if (/^~[/\\]/.test(folder)) {return path.join(os.homedir(), folder.slice(2));}
  return folder;
}

export interface AiFolderContext {
  /** `-f, --folder` value. Bypasses every configured default when present. */
  cliFolder?: string;
  /** Source being downloaded from; its `aiFolder` beats the config default. */
  source?: Pick<RepositorySource, 'aiFolder'>;
  /** Config-level default, set with `--set-default folder=<path>`. */
  config?: Pick<Config, 'aiFolder'>;
}

/**
 * Resolve the A.I. folder to download into, highest precedence first:
 *   1. `-f, --folder <path>`      (per-run override, absolute paths allowed)
 *   2. source `aiFolder`          (per-source property in the config file)
 *   3. config `aiFolder`          (`--set-default folder=<path>`)
 *   4. `.github`                  (built-in default)
 */
export function resolveAiFolder(context: AiFolderContext = {}): string {
  const { cliFolder, source, config } = context;

  if (cliFolder !== undefined && cliFolder.trim() !== '') {
    return normalizeAiFolder(cliFolder);
  }
  if (source?.aiFolder) {
    return normalizeAiFolder(source.aiFolder);
  }
  if (config?.aiFolder) {
    return normalizeAiFolder(config.aiFolder);
  }
  return DEFAULT_AI_FOLDER;
}

/**
 * Compose the directory a category downloads into.
 * A relative A.I. folder resolves beneath destDir; an absolute one replaces it.
 */
export function resolveCategoryDir(
  destDir: string,
  category: ToolCategory,
  aiFolder?: string
): string {
  const folder = normalizeAiFolder(aiFolder);
  if (isAbsolutePath(folder)) {
    return path.join(expandHome(folder), category);
  }
  return path.join(destDir, folder, category);
}
