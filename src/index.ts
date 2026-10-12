// Main entry point for programmatic usage of cmd-git-copilot-tools
// This exports all the engine modules for use as a library

// Export all types
export type {
  ToolCategory,
  FolderMappingValue,
  FolderMappings,
  RepositorySource,
  GitHubFileEntry,
  CopilotItem,
  DownloadMetadata,
  Config,
} from './types.js';

export {
  CATEGORY_LABELS,
  CATEGORY_DISPLAY,
  ORDERED_CATEGORIES,
  DOWNLOAD_PATHS,
  DEFAULT_AI_FOLDER,
  AbsoluteFolderPathError,
  GitHubApiError,
  MappedToolNotFoundError,
  ToolNotFoundError,
  SourceNotFoundError,
  InvalidUrlError,
  OnlyOneSourceError,
  MissingArgumentError,
} from './types.js';

// Export config management functions
export {
  loadConfig,
  saveConfig,
  addSource,
  removeSource,
  setDefaultSource,
  setDefaultFolder,
  findSource,
  listSources,
  parseGitHubUrl,
  getConfigPath,
  getDefaultConfig,
  getDefaultSources,
  getActiveSource,
} from './engine/config.js';

// Export GitHub API functions
export type { GitHubFileContent, RequestOptions } from './engine/github.js';
export {
  fetchAllToolsFromSources,
  fetchCategory,
  getToken,
  fetchDirectoryTree,
  buildApiUrl,
  getDirectoryContents,
  listDirectoryTree,
  getFileContent,
  getFileContentByPath,
  pathExists,
  fetchAllTools,
  configureRequests,
  getRequestOptions,
} from './engine/github.js';

// Export download functions
export type { DownloadOptions } from './engine/download.js';
export {
  downloadItem,
  downloadItemsByName,
  downloadFile,
  downloadDirectory,
  matchesToolName,
  resolveItemsByName,
  getFileSizeDisplay,
} from './engine/download.js';

// Export plugin helpers (manifest parsing and item-by-item plugin downloads)
export type {
  PluginItemKind,
  PluginItem,
  PluginMetadata,
  PluginParseResult,
  PluginDownloadResult,
} from './engine/plugin.js';
export {
  PLUGIN_JSON_RELATIVE_PATH,
  KIND_TO_CATEGORY,
  parsePluginMetadata,
  parsePluginJson,
  downloadPlugin,
} from './engine/plugin.js';

// Export folder-mapping helpers (array mappings and folder/name references)
export type { ToolReference } from './engine/mapping.js';
export {
  normalizeMappedFolder,
  getMappedFolders,
  resolveCategoryPaths,
  parseToolReference,
  formatToolReference,
  getItemFolder,
  getItemDisplayName,
} from './engine/mapping.js';

// Export A.I. folder resolution helpers
export type { AiFolderContext } from './engine/folder.js';
export {
  isAbsolutePath,
  normalizeAiFolder,
  resolveAiFolder,
  resolveCategoryDir,
} from './engine/folder.js';

// Export search and filter functions
export {
  searchTools,
  filterByCategory,
  groupByCategory,
  groupBySource,
  findByCode,
} from './engine/search.js';

// Export cache functions
export {
  cache,
  buildCachePrefix,
  buildCacheKey,
} from './engine/cache.js';

// Export permissions functions
export type { PermissionState, AuthPermission } from './engine/permissions.js';
export {
  loadPermissions,
  savePermissions,
} from './engine/permissions.js';
