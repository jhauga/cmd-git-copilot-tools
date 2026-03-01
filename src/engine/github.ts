import axios, { AxiosError } from 'axios';
import type { CopilotItem, GitHubFileEntry, RepositorySource, ToolCategory } from '../types.js';
import { ORDERED_CATEGORIES } from '../types.js';
import { cache, buildCacheKey } from './cache.js';

const USER_AGENT = 'cmd-git-copilot-tools/1.0.0';
const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_CACHE_TTL = 10000; // 10 seconds for directory listings

export function buildApiUrl(repo: RepositorySource, repoPath: string): string {
  const base = repo.baseUrl
    ? `${repo.baseUrl}/api/v3`
    : 'https://api.github.com';
  const branch = repo.branch ? `?ref=${encodeURIComponent(repo.branch)}` : '';
  const cleanPath = repoPath.startsWith('/') ? repoPath.slice(1) : repoPath;
  return `${base}/repos/${repo.owner}/${repo.repo}/contents/${cleanPath}${branch}`;
}

export function getToken(repo?: RepositorySource, enterpriseToken?: string): string | undefined {
  // Priority: GITHUB_TOKEN env var → enterprise token in config → undefined
  const envToken = process.env['GITHUB_TOKEN'];
  if (envToken) {return envToken;}
  if (enterpriseToken && repo?.baseUrl) {return enterpriseToken;}
  return undefined;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

function getAxiosConfig(repo: RepositorySource, token?: string) {
  const config: Record<string, unknown> = {
    headers: buildHeaders(token),
    timeout: 15000,
  };
  if (repo.baseUrl) {
    const env = process.env['NODE_TLS_REJECT_UNAUTHORIZED'];
    if (env === '0') {
      config['httpsAgent'] = new (require('https').Agent)({ rejectUnauthorized: false });
    }
  }
  return config;
}

export async function getDirectoryContents(
  repo: RepositorySource,
  repoPath: string,
  token?: string,
  ttl = DEFAULT_CACHE_TTL
): Promise<GitHubFileEntry[]> {
  const cacheKey = buildCacheKey(repo, repoPath);
  const cached = cache.get<GitHubFileEntry[]>(cacheKey);
  if (cached) {return cached;}

  const url = buildApiUrl(repo, repoPath);
  try {
    const response = await axios.get<GitHubFileEntry[] | GitHubFileEntry>(
      url,
      getAxiosConfig(repo, token)
    );

    const data = Array.isArray(response.data) ? response.data : [response.data];
    cache.set(cacheKey, data, ttl);
    return data;
  } catch (error) {
    handleGitHubError(error, repo, repoPath);
    throw error;
  }
}

export async function getFileContent(downloadUrl: string, token?: string): Promise<string> {
  const headers = buildHeaders(token);
  headers['Accept'] = 'application/vnd.github.raw+json';
  const response = await axios.get<string>(downloadUrl, {
    headers,
    responseType: 'text',
    timeout: 15000,
  });
  return response.data;
}

function handleGitHubError(error: unknown, repo: RepositorySource, repoPath: string): never {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const repoRef = `${repo.owner}/${repo.repo}`;
    if (status === 401) {
      throw new Error(
        `Authentication failed for ${repoRef}. Set GITHUB_TOKEN environment variable or configure an enterprise token.`
      );
    }
    if (status === 403) {
      const rateLimitReset = error.response?.headers['x-ratelimit-reset'];
      if (rateLimitReset) {
        const resetTime = new Date(parseInt(rateLimitReset) * 1000).toLocaleTimeString();
        throw new Error(`GitHub API rate limit exceeded for ${repoRef}. Resets at ${resetTime}. Set GITHUB_TOKEN for higher limits.`);
      }
      throw new Error(`Access forbidden to ${repoRef}. Check your token permissions.`);
    }
    if (status === 404) {
      throw new Error(`Path '${repoPath}' not found in ${repoRef}. The folder may not exist.`);
    }
    throw new Error(`GitHub API error (${status}): ${error.message}`);
  }
  throw error;
}

function getCategoryPath(repo: RepositorySource, category: ToolCategory): string | null {
  if (!repo.folderMappings) {
    return category;
  }
  const mapping = repo.folderMappings[category];
  if (mapping === null) {
    return null; // excluded
  }
  if (mapping === undefined) {
    return category; // default path
  }
  if (mapping === 'root') {
    return ''; // entire root
  }
  return mapping;
}

function hasRootMapping(repo: RepositorySource): ToolCategory | null {
  if (!repo.folderMappings) {return null;}
  for (const [cat, val] of Object.entries(repo.folderMappings)) {
    if (val === 'root') {return cat as ToolCategory;}
  }
  return null;
}

export async function fetchCategory(
  repo: RepositorySource,
  category: ToolCategory,
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<CopilotItem[]> {
  const repoPath = getCategoryPath(repo, category);
  if (repoPath === null) {return [];} // excluded

  let entries: GitHubFileEntry[];
  try {
    entries = await getDirectoryContents(repo, repoPath, token, cacheTtl);
  } catch {
    return []; // silently skip missing category folders
  }

  const items: CopilotItem[] = [];

  if (category === 'skills' || category === 'plugins') {
    // Skills and plugins are directories (folders)
    for (const entry of entries) {
      if (entry.type === 'dir') {
        items.push({
          id: `${repo.owner}/${repo.repo}/${category}/${entry.name}`,
          name: entry.name,
          category,
          repo,
          file: entry,
        });
      }
    }
  } else {
    // Agents, instructions, prompts, workflows are individual files
    for (const entry of entries) {
      if (entry.type === 'file') {
        items.push({
          id: `${repo.owner}/${repo.repo}/${category}/${entry.name}`,
          name: entry.name,
          category,
          repo,
          file: entry,
        });
      }
    }
  }

  return items;
}

export async function fetchAllTools(
  repo: RepositorySource,
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<CopilotItem[]> {
  const rootCategory = hasRootMapping(repo);

  if (rootCategory) {
    // Entire repo root treated as one category
    return fetchCategory(repo, rootCategory, token, cacheTtl);
  }

  const results = await Promise.allSettled(
    ORDERED_CATEGORIES.map(cat => fetchCategory(repo, cat, token, cacheTtl))
  );

  const items: CopilotItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }
  return items;
}

export async function fetchAllToolsFromSources(
  repos: RepositorySource[],
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<CopilotItem[]> {
  const results = await Promise.allSettled(
    repos.map(repo => fetchAllTools(repo, token, cacheTtl))
  );

  const items: CopilotItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }
  return items;
}

export async function fetchDirectoryTree(
  repo: RepositorySource,
  repoPath: string,
  token?: string
): Promise<GitHubFileEntry[]> {
  return getDirectoryContents(repo, repoPath, token, 5000);
}
