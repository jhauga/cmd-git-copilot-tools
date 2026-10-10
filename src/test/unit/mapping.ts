import {
  normalizeMappedFolder,
  getMappedFolders,
  parseToolReference,
  formatToolReference,
  getItemFolder,
  getItemDisplayName,
} from '../../engine/mapping.js';
import { fetchCategory, fetchAllTools } from '../../engine/github.js';
import { resolveItemsByName } from '../../engine/download.js';
import { cache, buildCacheKey } from '../../engine/cache.js';
import { MappedToolNotFoundError } from '../../types.js';
import type { CopilotItem, FolderMappingValue, GitHubFileEntry, RepositorySource } from '../../types.js';
import { runSuite, assert, assertEqual, assertDeepEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

function entry(entryPath: string, type: 'file' | 'dir'): GitHubFileEntry {
  return {
    name: entryPath.split('/').pop()!,
    path: entryPath,
    type,
    download_url: type === 'file' ? `https://example.com/${entryPath}` : null,
    size: 0,
    sha: 'abc123',
  };
}

// Source whose skills and agents are spread across several folders.
const mappedRepo: RepositorySource = {
  owner: 'acme-corp',
  repo: 'copilot-skills',
  folderMappings: {
    agents: ['team', 'ops'],
    cookbook: null,
    hooks: null,
    instructions: null,
    plugins: null,
    prompts: [],
    skills: ['web', 'data', '.'],
    workflows: null,
  },
};

// Source with a single-path mapping, for the unchanged behaviour.
const singleRepo: RepositorySource = {
  owner: 'acme-corp',
  repo: 'single-path',
  folderMappings: { skills: 'skills' },
};

/** Seed the cache so fetchCategory never reaches the network. */
function seedCache(): void {
  const ttl = 60000;
  cache.set(buildCacheKey(mappedRepo, 'web'), [
    entry('web/my-skill', 'dir'),
    entry('web/shared-skill', 'dir'),
    entry('web/README.md', 'file'),
  ], ttl);
  cache.set(buildCacheKey(mappedRepo, 'data'), [
    entry('data/shared-skill', 'dir'),
    entry('data/other-skill', 'dir'),
  ], ttl);
  cache.set(buildCacheKey(mappedRepo, ''), [
    entry('web', 'dir'),
    entry('data', 'dir'),
    entry('root-skill', 'dir'),
    entry('README.md', 'file'),
  ], ttl);
  cache.set(buildCacheKey(mappedRepo, 'team'), [
    entry('team/helper.agent.md', 'file'),
    entry('team/nested', 'dir'),
  ], ttl);
  cache.set(buildCacheKey(mappedRepo, 'ops'), [
    entry('ops/deploy.agent.md', 'file'),
  ], ttl);
  cache.set(buildCacheKey(singleRepo, 'skills'), [
    entry('skills/plain-skill', 'dir'),
  ], ttl);
}

async function mappedSkills(): Promise<CopilotItem[]> {
  seedCache();
  return fetchCategory(mappedRepo, 'skills');
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

export async function runMappingSuite(): Promise<SuiteResult> {
  const result = await runSuite('unit: mapping', {
    // --- normalizeMappedFolder -------------------------------------------
    'normalizeMappedFolder: root markers collapse to the empty string': () => {
      for (const marker of ['.', '/', './', '', '  .  ', '\\']) {
        assertEqual(normalizeMappedFolder(marker), '', `'${marker}' is the root`);
      }
    },
    'normalizeMappedFolder: strips leading and trailing separators': () => {
      assertEqual(normalizeMappedFolder('./web/'), 'web');
      assertEqual(normalizeMappedFolder('/web'), 'web');
      assertEqual(normalizeMappedFolder('tools//web/'), 'tools/web');
    },
    'normalizeMappedFolder: backslashes count as separators': () => {
      assertEqual(normalizeMappedFolder('tools\\web'), 'tools/web');
    },

    // --- getMappedFolders ------------------------------------------------
    'getMappedFolders: non-array mappings return null': () => {
      const values: Array<FolderMappingValue | undefined> = ['root', 'custom/path', null, undefined];
      for (const value of values) {
        assertEqual(getMappedFolders(value), null, `${JSON.stringify(value)} is not an array mapping`);
      }
    },
    'getMappedFolders: normalizes, de-duplicates, and keeps configured order': () => {
      assertDeepEqual(getMappedFolders(['web', './web', 'data', '/', '.']), ['web', 'data', '']);
    },
    'getMappedFolders: ignores non-string entries': () => {
      assertDeepEqual(getMappedFolders(['web', 42, null] as unknown as string[]), ['web']);
    },
    'getMappedFolders: empty array maps no folders': () => {
      assertDeepEqual(getMappedFolders([]), []);
    },

    // --- parseToolReference / formatToolReference -------------------------
    'parseToolReference: bare name has no folder': () => {
      const ref = parseToolReference('my-skill');
      assertEqual(ref.folder, undefined);
      assertEqual(ref.name, 'my-skill');
    },
    'parseToolReference: folder-qualified name': () => {
      const ref = parseToolReference('web/my-skill');
      assertEqual(ref.folder, 'web');
      assertEqual(ref.name, 'my-skill');
    },
    'parseToolReference: nested folder splits at the last separator': () => {
      const ref = parseToolReference('tools/web/my-skill');
      assertEqual(ref.folder, 'tools/web');
      assertEqual(ref.name, 'my-skill');
    },
    'parseToolReference: ./name and /name address the root': () => {
      assertEqual(parseToolReference('./my-skill').folder, '');
      assertEqual(parseToolReference('/my-skill').folder, '');
    },
    'parseToolReference: accepts a backslash separator': () => {
      const ref = parseToolReference('web\\my-skill');
      assertEqual(ref.folder, 'web');
      assertEqual(ref.name, 'my-skill');
    },
    'formatToolReference: root uses ./ and folders use folder/': () => {
      assertEqual(formatToolReference('', 'my-skill'), './my-skill');
      assertEqual(formatToolReference('web', 'my-skill'), 'web/my-skill');
    },

    // --- fetchCategory with array mappings --------------------------------
    'fetchCategory: lists every mapped folder in configured order': async () => {
      const items = await mappedSkills();
      assertDeepEqual(
        items.map(item => getItemDisplayName(item)),
        ['web/my-skill', 'web/shared-skill', 'data/shared-skill', 'data/other-skill', 'root-skill']
      );
    },
    'fetchCategory: tags each item with the folder it came from': async () => {
      const items = await mappedSkills();
      assertDeepEqual(items.map(item => item.mappedFolder), ['web', 'web', 'data', 'data', '']);
    },
    'fetchCategory: root entry skips the other mapped folders': async () => {
      const rootItems = (await mappedSkills()).filter(item => item.mappedFolder === '');
      assertDeepEqual(rootItems.map(item => item.name), ['root-skill']);
    },
    'fetchCategory: ids stay unique when two folders hold the same name': async () => {
      const ids = (await mappedSkills()).map(item => item.id);
      assertEqual(new Set(ids).size, ids.length, 'every id should be unique');
    },
    'fetchCategory: file-based tool types list files only': async () => {
      seedCache();
      const agents = await fetchCategory(mappedRepo, 'agents');
      assertDeepEqual(agents.map(item => getItemDisplayName(item)), ['team/helper.agent.md', 'ops/deploy.agent.md']);
    },
    'fetchCategory: empty array lists nothing': async () => {
      assertEqual((await fetchCategory(mappedRepo, 'prompts')).length, 0);
    },
    'fetchCategory: single-path mapping does not set mappedFolder': async () => {
      seedCache();
      const items = await fetchCategory(singleRepo, 'skills');
      assertEqual(items.length, 1);
      assertEqual(items[0]!.mappedFolder, undefined);
      assertEqual(getItemDisplayName(items[0]!), 'plain-skill');
    },
    'fetchAllTools: array mappings combine with excluded tool types': async () => {
      seedCache();
      const items = await fetchAllTools(mappedRepo);
      assertEqual(items.filter(item => item.category === 'skills').length, 5);
      assertEqual(items.filter(item => item.category === 'agents').length, 2);
      assertEqual(items.length, 7);
    },

    // --- getItemFolder ----------------------------------------------------
    'getItemFolder: uses the mapped folder, or the parent of the path': async () => {
      const items = await mappedSkills();
      assertEqual(getItemFolder(items[0]!), 'web');
      assertEqual(getItemFolder(items[4]!), '');
      const plain = await fetchCategory(singleRepo, 'skills');
      assertEqual(getItemFolder(plain[0]!), 'skills');
    },

    // --- resolveItemsByName -----------------------------------------------
    'resolveItemsByName: bare name resolves to the first folder that has it': async () => {
      const matches = resolveItemsByName(await mappedSkills(), 'shared-skill');
      assertEqual(matches.length, 1);
      assertEqual(matches[0]!.mappedFolder, 'web');
    },
    'resolveItemsByName: bare name falls through to later folders': async () => {
      const matches = resolveItemsByName(await mappedSkills(), 'other-skill');
      assertEqual(matches.length, 1);
      assertEqual(matches[0]!.mappedFolder, 'data');
    },
    'resolveItemsByName: bare name finds a tool at the root': async () => {
      const matches = resolveItemsByName(await mappedSkills(), 'root-skill');
      assertEqual(matches[0]!.mappedFolder, '');
    },
    'resolveItemsByName: folder/name downloads from that folder only': async () => {
      const matches = resolveItemsByName(await mappedSkills(), 'data/shared-skill');
      assertEqual(matches.length, 1);
      assertEqual(matches[0]!.mappedFolder, 'data');
    },
    'resolveItemsByName: ./name and /name resolve at the root': async () => {
      const items = await mappedSkills();
      assertEqual(resolveItemsByName(items, './root-skill')[0]!.name, 'root-skill');
      assertEqual(resolveItemsByName(items, '/root-skill')[0]!.name, 'root-skill');
    },
    'resolveItemsByName: folder match is case-insensitive': async () => {
      const matches = resolveItemsByName(await mappedSkills(), 'WEB/my-skill');
      assertEqual(matches[0]!.mappedFolder, 'web');
    },
    'resolveItemsByName: folder/name in the wrong folder reports where it is': async () => {
      const items = await mappedSkills();
      const err = catchError(() => resolveItemsByName(items, 'web/other-skill'));
      assert(err instanceof MappedToolNotFoundError, 'should throw MappedToolNotFoundError');
      const notFound = err as MappedToolNotFoundError;
      assertEqual(notFound.folder, 'web');
      assertDeepEqual(notFound.foundIn, ['data/other-skill']);
      assert(notFound.message.includes('Found as: data/other-skill'), notFound.message);
    },
    'resolveItemsByName: bare name missing everywhere lists searched folders': async () => {
      const items = await mappedSkills();
      const err = catchError(() => resolveItemsByName(items, 'missing-skill'));
      assert(err instanceof MappedToolNotFoundError, 'should throw MappedToolNotFoundError');
      const notFound = err as MappedToolNotFoundError;
      assertEqual(notFound.folder, undefined);
      assertDeepEqual(notFound.searchedFolders, ['web', 'data', '']);
      assert(notFound.message.includes('searched: web, data, .'), notFound.message);
    },
    'resolveItemsByName: unknown folder lists the available folders': async () => {
      const items = await mappedSkills();
      const err = catchError(() => resolveItemsByName(items, 'other/missing-skill'));
      assert(err instanceof MappedToolNotFoundError, 'should throw MappedToolNotFoundError');
      assert((err as Error).message.includes('Available folders: web, data, .'), (err as Error).message);
    },
    'resolveItemsByName: single-path sources keep the original not-found message': async () => {
      seedCache();
      const plain = await fetchCategory(singleRepo, 'skills');
      const err = catchError(() => resolveItemsByName(plain, 'missing-skill'));
      assert(err instanceof Error && !(err instanceof MappedToolNotFoundError), 'should throw a plain Error');
      assertEqual((err as Error).message, "Tool 'missing-skill' not found. Use --search to find available tools.");
    },
    'resolveItemsByName: folder without a tool name is rejected': async () => {
      const items = await mappedSkills();
      const err = catchError(() => resolveItemsByName(items, 'web/'));
      assert(err instanceof Error, 'should throw');
      assert((err as Error).message.includes('missing a tool name'), (err as Error).message);
    },
  });

  cache.clearRepo(mappedRepo);
  cache.clearRepo(singleRepo);
  return result;
}
