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
  findSource,
  listSources,
  parseGitHubUrl,
  getConfigPath,
  getDefaultConfig,
  getDefaultSources,
  getActiveSource,
} from './engine/config.js';

// Export GitHub API functions
export {
  fetchAllToolsFromSources,
  fetchCategory,
  getToken,
  fetchDirectoryTree,
  buildApiUrl,
  getDirectoryContents,
  getFileContent,
  fetchAllTools,
} from './engine/github.js';

// Export download functions
export {
  downloadItem,
  downloadItemsByName,
  downloadFile,
  matchesToolName,
  getFileSizeDisplay,
} from './engine/download.js';

// Export search and filter functions
export {
  searchTools,
  filterByCategory,
  groupByCategory,
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
