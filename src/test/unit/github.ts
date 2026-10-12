import {
  buildApiUrl,
  buildDispatcher,
  configureRequests,
  getDirectoryContents,
  getFileContent,
  getFileContentByPath,
  getRequestOptions,
  listDirectoryTree,
  pathExists,
} from '../../engine/github.js';
import { cache, buildCacheKey } from '../../engine/cache.js';
import { GitHubApiError } from '../../types.js';
import type { GitHubFileEntry, RepositorySource } from '../../types.js';
import { toBase64, withFetchStub } from '../stub.js';
import { runSuite, assert, assertEqual, assertDeepEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

const repo: RepositorySource = { owner: 'acme-corp', repo: 'copilot-tools' };

function entry(entryPath: string, type: 'file' | 'dir', size = 0): GitHubFileEntry {
  return {
    name: entryPath.split('/').pop()!,
    path: entryPath,
    type,
    download_url: type === 'file' ? `https://raw.example.com/${entryPath}` : null,
    size,
    sha: 'abc123',
  };
}

async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

function rateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return { 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(resetAt) };
}

export async function runGithubSuite(): Promise<SuiteResult> {
  const result = await runSuite('unit: github', {
    // --- GitHubApiError ---------------------------------------------------
    'GitHubApiError: 404 carries the status, the URL, and the not-found message': async () => {
      cache.clearRepo(repo);
      await withFetchStub({}, async () => {
        const err = await catchAsync(() => getDirectoryContents(repo, 'missing'));
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        const apiError = err as GitHubApiError;
        assertEqual(apiError.status, 404);
        assertEqual(apiError.url, buildApiUrl(repo, 'missing'));
        assertEqual(apiError.isRateLimit, false);
        assert(apiError.message.includes("Path 'missing' not found"), apiError.message);
      });
    },
    'GitHubApiError: 403 with no requests remaining is a rate limit': async () => {
      cache.clearRepo(repo);
      const resetAt = Math.floor(Date.now() / 1000) + 600;
      const url = buildApiUrl(repo, 'agents');
      await withFetchStub({
        [url]: { status: 403, headers: rateLimitHeaders(0, resetAt), body: { message: 'API rate limit exceeded' } },
      }, async () => {
        const err = await catchAsync(() => getDirectoryContents(repo, 'agents')) as GitHubApiError;
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual(err.status, 403);
        assertEqual(err.isRateLimit, true);
        assertEqual(err.rateLimitRemaining, 0);
        assertEqual(err.rateLimitReset?.getTime(), resetAt * 1000);
        assert(err.message.includes('rate limit exceeded'), err.message);
      });
    },
    'GitHubApiError: 403 with requests remaining is a permissions error': async () => {
      cache.clearRepo(repo);
      const url = buildApiUrl(repo, 'agents');
      await withFetchStub({
        [url]: { status: 403, headers: rateLimitHeaders(42, 0), body: { message: 'Forbidden' } },
      }, async () => {
        const err = await catchAsync(() => getDirectoryContents(repo, 'agents')) as GitHubApiError;
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual(err.isRateLimit, false);
        assertEqual(err.rateLimitRemaining, 42);
        assert(err.message.includes('Access forbidden'), err.message);
      });
    },
    'GitHubApiError: 401 keeps the authentication message': async () => {
      cache.clearRepo(repo);
      const url = buildApiUrl(repo, 'agents');
      await withFetchStub({ [url]: { status: 401, body: { message: 'Bad credentials' } } }, async () => {
        const err = await catchAsync(() => getDirectoryContents(repo, 'agents')) as GitHubApiError;
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual(err.status, 401);
        assertEqual(err.rateLimitRemaining, undefined);
        assert(err.message.includes('Authentication failed'), err.message);
      });
    },
    'GitHubApiError: 429 is a rate limit': async () => {
      cache.clearRepo(repo);
      const url = buildApiUrl(repo, 'agents');
      await withFetchStub({ [url]: { status: 429, body: { message: 'Too many requests' } } }, async () => {
        const err = await catchAsync(() => getDirectoryContents(repo, 'agents')) as GitHubApiError;
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual(err.isRateLimit, true);
        assert(err.message.includes('rate limit exceeded'), err.message);
      });
    },
    'getFileContent: a failing download throws GitHubApiError': async () => {
      const url = 'https://raw.example.com/agents/missing.agent.md';
      await withFetchStub({ [url]: { status: 500, body: 'boom' } }, async () => {
        const err = await catchAsync(() => getFileContent(url)) as GitHubApiError;
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual(err.status, 500);
        assertEqual(err.url, url);
      });
    },

    // --- getFileContentByPath ---------------------------------------------
    'getFileContentByPath: decodes inline base64 content and caches it': async () => {
      cache.clearRepo(repo);
      const filePath = 'agents/helper.agent.md';
      await withFetchStub({
        [buildApiUrl(repo, filePath)]: { body: { ...entry(filePath, 'file', 7), content: toBase64('# agent'), encoding: 'base64' } },
      }, async stub => {
        const file = await getFileContentByPath(repo, filePath);
        assertEqual(file.content, '# agent');
        assertEqual(file.sha, 'abc123');
        assertEqual(file.size, 7);
        assertEqual(file.download_url, `https://raw.example.com/${filePath}`);
        assertEqual(stub.calls.length, 1, 'one request');
        await getFileContentByPath(repo, filePath);
        assertEqual(stub.calls.length, 1, 'the second read is served from the cache');
      });
    },
    'getFileContentByPath: fetches large files from the download URL': async () => {
      cache.clearRepo(repo);
      const filePath = 'agents/large.agent.md';
      const large = entry(filePath, 'file', 2000000);
      await withFetchStub({
        [buildApiUrl(repo, filePath)]: { body: { ...large, content: '', encoding: 'none' } },
        [large.download_url!]: { body: 'large body' },
      }, async stub => {
        const file = await getFileContentByPath(repo, filePath);
        assertEqual(file.content, 'large body');
        assertEqual(stub.calls.length, 2);
      });
    },
    'getFileContentByPath: a folder path is rejected': async () => {
      cache.clearRepo(repo);
      await withFetchStub({
        [buildApiUrl(repo, 'agents')]: { body: [entry('agents/helper.agent.md', 'file')] },
      }, async () => {
        const err = await catchAsync(() => getFileContentByPath(repo, 'agents'));
        assert(err instanceof Error && !(err instanceof GitHubApiError), 'should throw a plain Error');
        assert((err as Error).message.includes('is not a file'), (err as Error).message);
      });
    },

    // --- pathExists -------------------------------------------------------
    'pathExists: true on 200 and false on 404': async () => {
      cache.clearRepo(repo);
      const filePath = 'skills/my-skill/SKILL.md';
      await withFetchStub({
        [buildApiUrl(repo, filePath)]: { body: { ...entry(filePath, 'file'), content: toBase64('# skill') } },
      }, async () => {
        assertEqual(await pathExists(repo, filePath), true);
        assertEqual(await pathExists(repo, 'skills/my-skill/missing.md'), false);
      });
    },
    'pathExists: a cached listing answers without a request': async () => {
      cache.clearRepo(repo);
      cache.set(buildCacheKey(repo, 'skills'), [entry('skills/my-skill', 'dir')], 60000);
      await withFetchStub({}, async stub => {
        assertEqual(await pathExists(repo, 'skills'), true);
        assertEqual(stub.calls.length, 0, 'no request for a cached path');
      });
    },
    'pathExists: a folder answer is kept for the next listing': async () => {
      cache.clearRepo(repo);
      await withFetchStub({
        [buildApiUrl(repo, 'hooks')]: { body: [entry('hooks/session-logger', 'dir')] },
      }, async stub => {
        assertEqual(await pathExists(repo, 'hooks'), true);
        const entries = await getDirectoryContents(repo, 'hooks');
        assertEqual(entries.length, 1);
        assertEqual(stub.calls.length, 1, 'the listing came from the cache');
      });
    },
    'pathExists: other failures throw': async () => {
      cache.clearRepo(repo);
      await withFetchStub({
        [buildApiUrl(repo, 'agents')]: { status: 500, body: { message: 'boom' } },
      }, async () => {
        const err = await catchAsync(() => pathExists(repo, 'agents'));
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual((err as GitHubApiError).status, 500);
      });
    },

    // --- listDirectoryTree ------------------------------------------------
    'listDirectoryTree: flattens nested folders in listing order': async () => {
      cache.clearRepo(repo);
      cache.set(buildCacheKey(repo, 'skills/my-skill'), [
        entry('skills/my-skill/SKILL.md', 'file'),
        entry('skills/my-skill/references', 'dir'),
      ], 60000);
      cache.set(buildCacheKey(repo, 'skills/my-skill/references'), [
        entry('skills/my-skill/references/guide.md', 'file'),
      ], 60000);
      const tree = await listDirectoryTree(repo, 'skills/my-skill');
      assertDeepEqual(
        tree.map(e => e.path),
        ['skills/my-skill/SKILL.md', 'skills/my-skill/references', 'skills/my-skill/references/guide.md']
      );
    },

    // --- request options --------------------------------------------------
    'buildDispatcher: validation stays on by default': () => {
      assertEqual(getRequestOptions().allowInsecureEnterpriseCerts, false);
      assertEqual(buildDispatcher('https://github.example.com/api/v3/repos/acme-corp/copilot-tools/contents/agents'), undefined);
    },
    'buildDispatcher: github.com hosts keep validation with the option on': () => {
      configureRequests({ allowInsecureEnterpriseCerts: true });
      try {
        assertEqual(buildDispatcher('https://api.github.com/repos/acme-corp/copilot-tools/contents/agents'), undefined);
        assertEqual(buildDispatcher('https://raw.githubusercontent.com/acme-corp/copilot-tools/main/README.md'), undefined);
        assertEqual(buildDispatcher('not a url'), undefined);
        const agent = buildDispatcher('https://github.example.com/api/v3/repos/acme-corp/copilot-tools/contents/agents');
        assert(agent !== undefined, 'an enterprise host should get the insecure agent');
        assertEqual(buildDispatcher('https://github.example.com/other'), agent, 'the agent is reused');
      } finally {
        configureRequests({ allowInsecureEnterpriseCerts: false });
      }
    },
    'configureRequests: the timeout accepts positive values only': () => {
      const original = getRequestOptions().timeoutMs;
      configureRequests({ timeoutMs: 0 });
      assertEqual(getRequestOptions().timeoutMs, original);
      configureRequests({ timeoutMs: 10000 });
      assertEqual(getRequestOptions().timeoutMs, 10000);
      configureRequests({ timeoutMs: original });
    },
  });

  cache.clearRepo(repo);
  return result;
}
