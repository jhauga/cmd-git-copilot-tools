import type { RepositorySource, ToolCategory } from '../types.js';
import { resolveCategoryPaths } from './mapping.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {return undefined;}
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.store.set(key, { data, timestamp: Date.now(), ttl });
  }

  clear(): void {
    this.store.clear();
  }

  clearRepo(repo: RepositorySource): void {
    const prefix = buildCachePrefix(repo);
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Drop the listings a tool type is read from: one key per mapped path. */
  clearCategory(repo: RepositorySource, category: ToolCategory): void {
    for (const repoPath of resolveCategoryPaths(repo, category)) {
      this.store.delete(buildCacheKey(repo, repoPath));
    }
  }

  size(): number {
    return this.store.size;
  }
}

export function buildCachePrefix(repo: RepositorySource): string {
  const base = repo.baseUrl ?? 'https://api.github.com';
  const branch = repo.branch ?? 'HEAD';
  return `${base}/${repo.owner}/${repo.repo}/${branch}|`;
}

export function buildCacheKey(repo: RepositorySource, path: string): string {
  return `${buildCachePrefix(repo)}${path}`;
}

// Singleton cache instance
export const cache = new Cache();
