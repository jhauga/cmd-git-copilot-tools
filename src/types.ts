// Core TypeScript interfaces for cmd-git-copilot-tools

export type ToolCategory = 'agents' | 'instructions' | 'plugins' | 'prompts' | 'skills' | 'workflows';

export type FolderMappingValue = string | 'root' | null;

export interface FolderMappings {
  agents?: FolderMappingValue;
  instructions?: FolderMappingValue;
  plugins?: FolderMappingValue;
  prompts?: FolderMappingValue;
  skills?: FolderMappingValue;
  workflows?: FolderMappingValue;
}

export interface RepositorySource {
  owner: string;
  repo: string;
  label?: string;
  baseUrl?: string;
  branch?: string;
  folderMappings?: FolderMappings;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  size: number;
  sha: string;
}

export interface CopilotItem {
  id: string;
  name: string;
  category: ToolCategory;
  repo: RepositorySource;
  file: GitHubFileEntry;
  content?: string;
}

export interface DownloadMetadata {
  itemId: string;
  itemName: string;
  category: ToolCategory;
  repoOwner: string;
  repoName: string;
  downloadTimestamp: number;
  sha: string;
  size: number;
  downloadUrl: string;
  localPath: string;
}

export interface Config {
  sources: RepositorySource[];
  defaultSourceIndex: number;
  enterpriseToken?: string;
  cacheTimeout: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  checkForUpdates: boolean;
  allowInsecureEnterpriseCerts: boolean;
  downloads?: Record<string, DownloadMetadata>;
}

// Category label → ToolCategory mapping
export const CATEGORY_LABELS: Record<string, ToolCategory> = {
  a: 'agents',
  i: 'instructions',
  pl: 'plugins',
  p: 'prompts',
  s: 'skills',
  w: 'workflows',
};

// ToolCategory → display info
export const CATEGORY_DISPLAY: Record<ToolCategory, { label: string; title: string }> = {
  agents: { label: 'a', title: 'Agents' },
  instructions: { label: 'i', title: 'Instructions' },
  plugins: { label: 'pl', title: 'Plugins' },
  prompts: { label: 'p', title: 'Prompts' },
  skills: { label: 's', title: 'Skills' },
  workflows: { label: 'w', title: 'Workflows' },
};

// Ordered list of categories for display
export const ORDERED_CATEGORIES: ToolCategory[] = [
  'agents',
  'instructions',
  'plugins',
  'prompts',
  'skills',
  'workflows',
];

// Default download paths
export const DOWNLOAD_PATHS: Record<ToolCategory, string> = {
  agents: '.github/agents',
  instructions: '.github/instructions',
  plugins: '.github/plugins',
  prompts: '.github/prompts',
  skills: '.github/skills',
  workflows: '.github/workflows',
};

// Custom error types
export class ToolNotFoundError extends Error {
  constructor(toolName: string, category: ToolCategory | 'all') {
    super(`Tool '${toolName}' not found${category !== 'all' ? ` in ${category}` : ''}`);
    this.name = 'ToolNotFoundError';
  }
}

export class SourceNotFoundError extends Error {
  constructor(urlOrLabel: string) {
    super(`Source '${urlOrLabel}' is not configured. Use --list-source to see available sources.`);
    this.name = 'SourceNotFoundError';
  }
}

export class InvalidUrlError extends Error {
  constructor(url: string) {
    super(`Invalid URL: '${url}'. Expected format: https://github.com/owner/repo`);
    this.name = 'InvalidUrlError';
  }
}

export class OnlyOneSourceError extends Error {
  constructor() {
    super('Cannot remove: only one source is configured. Add another source before removing this one.');
    this.name = 'OnlyOneSourceError';
  }
}

export class MissingArgumentError extends Error {
  constructor(flag: string, description: string) {
    super(`${flag} requires ${description}. See --help for usage.`);
    this.name = 'MissingArgumentError';
  }
}
