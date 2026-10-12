import { spawnSync } from 'child_process';
import { Agent, fetch as undiciFetch } from 'undici';
import type { CopilotItem, GitHubFileEntry, RepositorySource, ToolCategory } from '../types.js';
import { GitHubApiError, ORDERED_CATEGORIES } from '../types.js';
import { cache, buildCacheKey } from './cache.js';
import { resolveCategoryPaths } from './mapping.js';

declare const __PKG_VERSION__: string;

const USER_AGENT = `cmd-git-copilot-tools/${__PKG_VERSION__}`;
const GITHUB_API_VERSION = '2022-11-28';
const DEFAULT_CACHE_TTL = 10000; // 10 seconds for directory listings
const DEFAULT_TIMEOUT_MS = 15000;

/** Hosts that keep certificate validation whatever the request options say. */
const PUBLIC_GITHUB_HOSTS = new Set(['github.com', 'api.github.com', 'raw.githubusercontent.com']);

export interface RequestOptions {
  /**
   * Skip TLS certificate validation for GitHub Enterprise hosts. Requests to
   * github.com and its subdomains always validate certificates. Off by default.
   */
  allowInsecureEnterpriseCerts?: boolean;
  /** Time one request may take before it is aborted, in milliseconds (default: 15000). */
  timeoutMs?: number;
}

const requestOptions: Required<RequestOptions> = {
  allowInsecureEnterpriseCerts: false,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

let insecureAgent: Agent | undefined;

/**
 * Set the request options used by every later call in this process. Options
 * that are omitted keep their current value.
 */
export function configureRequests(options: RequestOptions): void {
  if (options.allowInsecureEnterpriseCerts !== undefined) {
    requestOptions.allowInsecureEnterpriseCerts = options.allowInsecureEnterpriseCerts;
  }
  if (options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    requestOptions.timeoutMs = options.timeoutMs;
  }
}

/** A copy of the request options in effect. */
export function getRequestOptions(): Required<RequestOptions> {
  return { ...requestOptions };
}

/**
 * The dispatcher that skips certificate validation for `url`, or undefined
 * when the request keeps the default validation: the option is off, the host
 * belongs to github.com, or the URL cannot be parsed.
 */
export function buildDispatcher(url: string): Agent | undefined {
  if (!requestOptions.allowInsecureEnterpriseCerts) {return undefined;}

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (PUBLIC_GITHUB_HOSTS.has(host) || host.endsWith('.github.com') || host.endsWith('.githubusercontent.com')) {
    return undefined;
  }

  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  return insecureAgent;
}

export function buildApiUrl(repo: RepositorySource, repoPath: string): string {
  const base = repo.baseUrl
    ? `${repo.baseUrl}/api/v3`
    : 'https://api.github.com';
  const branch = repo.branch ? `?ref=${encodeURIComponent(repo.branch)}` : '';
  const cleanPath = repoPath.startsWith('/') ? repoPath.slice(1) : repoPath;
  return `${base}/repos/${repo.owner}/${repo.repo}/contents/${cleanPath}${branch}`;
}

export function getToken(repo?: RepositorySource, enterpriseToken?: string): string | undefined {
  // Priority: GITHUB_TOKEN → GH_TOKEN → gh CLI → enterprise token → undefined
  const envToken = process.env['GITHUB_TOKEN'];
  if (envToken) {return envToken;}

  const ghEnvToken = process.env['GH_TOKEN'];
  if (ghEnvToken) {return ghEnvToken;}

  // Fall back to the token stored by `gh auth login`
  try {
    const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf-8', timeout: 3000 });
    if (result.status === 0 && result.stdout) {
      const token = result.stdout.trim();
      if (token) {return token;}
    }
  } catch {
    // gh CLI not available or not authenticated — silent fallback
  }

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

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestOptions.timeoutMs);
  try {
    const dispatcher = buildDispatcher(url);
    if (dispatcher) {
      const insecureInit = { ...init, signal: controller.signal, dispatcher } as unknown as Parameters<typeof undiciFetch>[1];
      const response = await undiciFetch(url, insecureInit);
      return response as unknown as Response;
    }
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GET `url`, turning a timeout into an error that names what was requested. */
async function request(url: string, init: RequestInit, target: string): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out for ${target}.`);
    }
    throw error;
  }
}

function describePath(repo: RepositorySource, repoPath: string): string {
  return `${repo.owner}/${repo.repo} path '${repoPath}'`;
}

function parseHeaderInt(value: string | null): number | undefined {
  if (value === null) {return undefined;}
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function readRateLimit(response: Response): { remaining?: number; reset?: Date } {
  const remaining = parseHeaderInt(response.headers.get('x-ratelimit-remaining'));
  const resetSeconds = parseHeaderInt(response.headers.get('x-ratelimit-reset'));
  return {
    remaining,
    reset: resetSeconds === undefined ? undefined : new Date(resetSeconds * 1000),
  };
}

function handleGitHubError(response: Response, repo: RepositorySource, repoPath: string, url: string): never {
  const status = response.status;
  const repoRef = `${repo.owner}/${repo.repo}`;
  const rateLimit = readRateLimit(response);
  const fail = (message: string): GitHubApiError => new GitHubApiError(message, status, url, rateLimit);

  if (status === 401) {
    throw fail(`Authentication failed for ${repoRef}. Set GITHUB_TOKEN environment variable or configure an enterprise token.`);
  }
  if (status === 429 || (status === 403 && rateLimit.remaining === 0)) {
    const resetTime = rateLimit.reset ? ` Resets at ${rateLimit.reset.toLocaleTimeString()}.` : '';
    throw fail(`GitHub API rate limit exceeded for ${repoRef}.${resetTime} Set GITHUB_TOKEN for higher limits.`);
  }
  if (status === 403) {
    throw fail(`Access forbidden to ${repoRef}. Check your token permissions.`);
  }
  if (status === 404) {
    throw fail(`Path '${repoPath}' not found in ${repoRef}. The folder may not exist.`);
  }
  throw fail(`GitHub API error (${status}): ${response.statusText}`);
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
  const response = await request(url, { headers: buildHeaders(token) }, describePath(repo, repoPath));
  if (!response.ok) {
    handleGitHubError(response, repo, repoPath, url);
  }
  const json = await response.json() as GitHubFileEntry[] | GitHubFileEntry;
  const data = Array.isArray(json) ? json : [json];
  cache.set(cacheKey, data, ttl);
  return data;
}

/**
 * Every entry below `repoPath`, listed folder by folder: a folder's own
 * entries come first, followed by the entries of each subfolder in turn.
 */
export async function listDirectoryTree(
  repo: RepositorySource,
  repoPath: string,
  token?: string,
  ttl = DEFAULT_CACHE_TTL
): Promise<GitHubFileEntry[]> {
  const entries = await getDirectoryContents(repo, repoPath, token, ttl);
  const subtrees = await Promise.all(
    entries
      .filter(entry => entry.type === 'dir')
      .map(entry => listDirectoryTree(repo, entry.path, token, ttl))
  );
  return entries.concat(...subtrees);
}

/**
 * Whether `repoPath` exists in the repository. A cached listing or file
 * answers without a request. A 404 answers false; other failures throw.
 */
export async function pathExists(repo: RepositorySource, repoPath: string, token?: string): Promise<boolean> {
  const cacheKey = buildCacheKey(repo, repoPath);
  if (cache.get(cacheKey) !== undefined || cache.get(fileCacheKey(repo, repoPath)) !== undefined) {
    return true;
  }

  const url = buildApiUrl(repo, repoPath);
  const response = await request(url, { headers: buildHeaders(token) }, describePath(repo, repoPath));
  if (response.ok) {
    // Keep the listing when the path is a folder, so the next listing call is free.
    const json = await response.json() as GitHubFileEntry[] | GitHubFileEntry;
    if (Array.isArray(json)) {
      cache.set(cacheKey, json, DEFAULT_CACHE_TTL);
    }
    return true;
  }
  if (response.status === 404) {
    await response.arrayBuffer().catch(() => undefined);
    return false;
  }
  return handleGitHubError(response, repo, repoPath, url);
}

export interface GitHubFileContent {
  content: string;
  download_url: string | null;
  sha: string;
  size: number;
}

type ContentsApiFile = GitHubFileEntry & { content?: string; encoding?: string };

function fileCacheKey(repo: RepositorySource, filePath: string): string {
  return `${buildCacheKey(repo, filePath)}#file`;
}

/**
 * Read one file through the contents API. Files up to 1 MB arrive inline and
 * are decoded; larger files are fetched from their download URL.
 */
export async function getFileContentByPath(
  repo: RepositorySource,
  filePath: string,
  token?: string,
  ttl = DEFAULT_CACHE_TTL
): Promise<GitHubFileContent> {
  const cacheKey = fileCacheKey(repo, filePath);
  const cached = cache.get<GitHubFileContent>(cacheKey);
  if (cached) {return cached;}

  const url = buildApiUrl(repo, filePath);
  const response = await request(url, { headers: buildHeaders(token) }, describePath(repo, filePath));
  if (!response.ok) {
    handleGitHubError(response, repo, filePath, url);
  }
  const data = await response.json() as ContentsApiFile | ContentsApiFile[];
  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Path '${filePath}' in ${repo.owner}/${repo.repo} is not a file.`);
  }

  let content: string;
  if (typeof data.content === 'string' && data.content !== '') {
    const encoding = data.encoding === 'utf-8' ? 'utf-8' : 'base64';
    content = Buffer.from(data.content, encoding).toString('utf-8');
  } else if (data.download_url) {
    content = await getFileContent(data.download_url, token);
  } else {
    throw new Error(`Path '${filePath}' in ${repo.owner}/${repo.repo} has no content.`);
  }

  const result: GitHubFileContent = { content, download_url: data.download_url, sha: data.sha, size: data.size };
  cache.set(cacheKey, result, ttl);
  return result;
}

export async function getFileContent(downloadUrl: string, token?: string): Promise<string> {
  const headers = buildHeaders(token);
  headers['Accept'] = 'application/vnd.github.raw+json';
  const response = await request(downloadUrl, { headers }, downloadUrl);
  if (!response.ok) {
    throw new GitHubApiError(
      `Failed to fetch file content (${response.status}): ${response.statusText}`,
      response.status,
      downloadUrl,
      readRateLimit(response)
    );
  }
  return response.text();
}

function hasRootMapping(repo: RepositorySource): ToolCategory | null {
  if (!repo.folderMappings) {return null;}
  for (const [cat, val] of Object.entries(repo.folderMappings)) {
    if (val === 'root') {return cat as ToolCategory;}
  }
  return null;
}

async function listCategoryEntries(
  repo: RepositorySource,
  repoPath: string,
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<GitHubFileEntry[]> {
  try {
    return await getDirectoryContents(repo, repoPath, token, cacheTtl);
  } catch (err) {
    // Only silently skip "path not found" (404) errors — category folder may not exist in this repo.
    // Re-throw rate-limit, auth, network, and other errors so callers can surface them.
    if (err instanceof GitHubApiError && err.status === 404) {
      return [];
    }
    throw err;
  }
}

function toCopilotItems(
  repo: RepositorySource,
  category: ToolCategory,
  entries: GitHubFileEntry[],
  mappedFolder?: string
): CopilotItem[] {
  // Skills, plugins, and hooks are directories (folders); agents, instructions,
  // prompts, and workflows are individual files.
  const entryType = category === 'skills' || category === 'plugins' || category === 'hooks' ? 'dir' : 'file';

  const items: CopilotItem[] = [];
  for (const entry of entries) {
    if (entry.type !== entryType) {continue;}
    const item: CopilotItem = {
      // Array mappings key on the full path: two folders may hold the same name.
      id: `${repo.owner}/${repo.repo}/${category}/${mappedFolder === undefined ? entry.name : entry.path}`,
      name: entry.name,
      category,
      repo,
      file: entry,
    };
    if (mappedFolder !== undefined) {item.mappedFolder = mappedFolder;}
    items.push(item);
  }
  return items;
}

/**
 * List a tool type mapped to an array of folders. Items keep the configured
 * folder order, which is the order a bare download name is resolved in.
 */
async function fetchMappedFolders(
  repo: RepositorySource,
  category: ToolCategory,
  folders: string[],
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<CopilotItem[]> {
  // A root entry in the array must not list the other mapped folders as tools.
  const mappedTopLevel = new Set(
    folders.filter(folder => folder !== '').map(folder => folder.split('/')[0]!)
  );

  const results = await Promise.allSettled(
    folders.map(folder => listCategoryEntries(repo, folder, token, cacheTtl))
  );

  const items: CopilotItem[] = [];
  let firstError: Error | undefined;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      firstError ??= result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      return;
    }
    const folder = folders[i]!;
    const entries = folder === ''
      ? result.value.filter(entry => !mappedTopLevel.has(entry.name))
      : result.value;
    items.push(...toCopilotItems(repo, category, entries, folder));
  });

  if (items.length === 0 && firstError) {
    throw firstError;
  }
  return items;
}

export async function fetchCategory(
  repo: RepositorySource,
  category: ToolCategory,
  token?: string,
  cacheTtl = DEFAULT_CACHE_TTL
): Promise<CopilotItem[]> {
  const paths = resolveCategoryPaths(repo, category);
  if (paths.length === 0) {return [];} // excluded

  if (Array.isArray(repo.folderMappings?.[category])) {
    return fetchMappedFolders(repo, category, paths, token, cacheTtl);
  }

  const entries = await listCategoryEntries(repo, paths[0]!, token, cacheTtl);
  return toCopilotItems(repo, category, entries);
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
  let firstError: Error | undefined;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else if (!firstError) {
      firstError = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
  }

  // Surface the error if no items were returned (e.g. rate-limited on all categories)
  if (items.length === 0 && firstError) {
    throw firstError;
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
  let firstError: Error | undefined;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else if (!firstError) {
      firstError = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
  }

  // Surface the error if no items were returned across all sources
  if (items.length === 0 && firstError) {
    throw firstError;
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
