import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AWESOME_COPILOT_NAMESPACE,
  KIND_TO_CATEGORY,
  PLUGIN_MANIFEST_PATHS,
  downloadPlugin,
  getSkippedPluginEntries,
  parsePluginJson,
  parsePluginMetadata,
} from '../../engine/plugin.js';
import type { PluginMetadata } from '../../engine/plugin.js';
import { buildApiUrl } from '../../engine/github.js';
import { cache } from '../../engine/cache.js';
import { GitHubApiError } from '../../types.js';
import type { CopilotItem, GitHubFileEntry, RepositorySource } from '../../types.js';
import { toBase64, withFetchStub } from '../stub.js';
import type { StubRoute } from '../stub.js';
import { runSuite, assert, assertEqual, assertDeepEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

const repo: RepositorySource = { owner: 'acme-corp', repo: 'copilot-tools' };
const PLUGIN_DIR = 'plugins/sample-plugin';
const ROOT_MANIFEST = `${PLUGIN_DIR}/plugin.json`;
const LEGACY_MANIFEST = `${PLUGIN_DIR}/.github/plugin/plugin.json`;
const RAW = 'https://raw.example.com';

function entry(entryPath: string, type: 'file' | 'dir', size = 0): GitHubFileEntry {
  return {
    name: entryPath.split('/').pop()!,
    path: entryPath,
    type,
    download_url: type === 'file' ? `${RAW}/${entryPath}` : null,
    size,
    sha: 'abc123',
  };
}

/** A contents API answer for one file, with its body inline. */
function fileRoute(entryPath: string, text: string): StubRoute {
  return { body: { ...entry(entryPath, 'file', text.length), content: toBase64(text), encoding: 'base64' } };
}

function parse(manifest: object | string): PluginMetadata {
  return parsePluginMetadata(typeof manifest === 'string' ? manifest : JSON.stringify(manifest), PLUGIN_DIR);
}

function expectInvalid(manifest: object | string, detail: string): void {
  let message = '';
  try {
    parse(manifest);
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  assert(message.startsWith('Invalid plugin.json format'), `expected a format error, got: ${message || '(no error)'}`);
  assert(message.includes(detail), `expected '${detail}' in: ${message}`);
}

async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

function pluginItem(source: RepositorySource): CopilotItem {
  return {
    id: `${source.owner}/${source.repo}/plugins/sample-plugin`,
    name: 'sample-plugin',
    category: 'plugins',
    repo: source,
    file: entry(PLUGIN_DIR, 'dir'),
  };
}

/** Plugin-relative arrays, kept in `.github/plugin/plugin.json`. */
const relativeManifest = {
  name: 'Sample Plugin',
  description: 'Bundles a few tools',
  version: '1.0.0',
  agents: ['./agents'],
  skills: ['./skills/my-skill'],
  instructions: ['./instructions/coding.instructions.md'],
};

/** Agent Plugins layout, kept in `plugin.json` at the plugin folder root. */
const agentPluginsManifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'sample-plugin',
  description: 'Bundles repository agents and skills',
  version: '1.0.0',
  extensions: {
    [AWESOME_COPILOT_NAMESPACE]: {
      agents: ['./agents/helper.md'],
      skills: ['./skills/my-skill/'],
      extensions: ['./extensions/sample-board'],
    },
  },
};

/** Every URL a download of the plugin-relative sample requests. */
function relativeRoutes(manifest: object): Record<string, StubRoute> {
  return {
    [buildApiUrl(repo, LEGACY_MANIFEST)]: fileRoute(LEGACY_MANIFEST, JSON.stringify(manifest)),
    [buildApiUrl(repo, `${PLUGIN_DIR}/agents`)]: { body: [entry(`${PLUGIN_DIR}/agents/helper.agent.md`, 'file')] },
    [`${RAW}/${PLUGIN_DIR}/agents/helper.agent.md`]: { body: '# helper' },
    [buildApiUrl(repo, `${PLUGIN_DIR}/skills/my-skill`)]: {
      body: [entry(`${PLUGIN_DIR}/skills/my-skill/SKILL.md`, 'file'), entry(`${PLUGIN_DIR}/skills/my-skill/references`, 'dir')],
    },
    [buildApiUrl(repo, `${PLUGIN_DIR}/skills/my-skill/references`)]: {
      body: [entry(`${PLUGIN_DIR}/skills/my-skill/references/guide.md`, 'file')],
    },
    [`${RAW}/${PLUGIN_DIR}/skills/my-skill/SKILL.md`]: { body: '# skill' },
    [`${RAW}/${PLUGIN_DIR}/skills/my-skill/references/guide.md`]: { body: '# guide' },
    [buildApiUrl(repo, `${PLUGIN_DIR}/instructions/coding.instructions.md`)]: fileRoute(`${PLUGIN_DIR}/instructions/coding.instructions.md`, '# coding'),
    [buildApiUrl(repo, PLUGIN_DIR)]: {
      body: [
        entry(`${PLUGIN_DIR}/.github`, 'dir'),
        entry(`${PLUGIN_DIR}/agents`, 'dir'),
        entry(`${PLUGIN_DIR}/commands`, 'dir'),
        entry(`${PLUGIN_DIR}/instructions`, 'dir'),
        entry(`${PLUGIN_DIR}/skills`, 'dir'),
        entry(`${PLUGIN_DIR}/README.md`, 'file'),
      ],
    },
    [buildApiUrl(repo, `${PLUGIN_DIR}/commands`)]: { body: [entry(`${PLUGIN_DIR}/commands/do-thing.md`, 'file')] },
    [`${RAW}/${PLUGIN_DIR}/commands/do-thing.md`]: { body: '# do thing' },
    [`${RAW}/${PLUGIN_DIR}/README.md`]: { body: '# Sample Plugin' },
  };
}

/** Every URL a download of the Agent Plugins sample requests. */
function agentPluginsRoutes(): Record<string, StubRoute> {
  return {
    [buildApiUrl(repo, ROOT_MANIFEST)]: fileRoute(ROOT_MANIFEST, JSON.stringify(agentPluginsManifest)),
    [buildApiUrl(repo, 'agents/helper.agent.md')]: fileRoute('agents/helper.agent.md', '# helper'),
    [buildApiUrl(repo, 'skills/my-skill')]: { body: [entry('skills/my-skill/SKILL.md', 'file')] },
    [`${RAW}/skills/my-skill/SKILL.md`]: { body: '# skill' },
    [buildApiUrl(repo, PLUGIN_DIR)]: {
      body: [entry(`${PLUGIN_DIR}/README.md`, 'file'), entry(ROOT_MANIFEST, 'file'), entry(`${PLUGIN_DIR}/mcp.json`, 'file')],
    },
    [`${RAW}/${PLUGIN_DIR}/README.md`]: { body: '# Sample Plugin' },
    [`${RAW}/${PLUGIN_DIR}/mcp.json`]: { body: '{ "servers": {} }' },
  };
}

function tempDir(): string {
  const dir = path.join(os.tmpdir(), 'cmd-git-copilot-tools', 'test-plugin');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

export async function runPluginSuite(): Promise<SuiteResult> {
  const result = await runSuite('unit: plugin', {
    // --- parsePluginMetadata: legacy items -----------------------------------
    'parsePluginMetadata: parses a legacy manifest with every required field': () => {
      const metadata = parse({
        name: 'Sample Plugin',
        description: 'A plugin used for validation',
        version: '1.0.0',
        author: { name: 'Jane Doe' },
        tags: ['sample', 'demo'],
        items: [
          { path: 'instructions/sample.instructions.md', kind: 'instruction' },
          { path: 'prompts/sample.prompt.md', kind: 'prompt' },
        ],
        display: { ordering: 'alpha', show_badge: true },
      });
      assertEqual(metadata.id, 'sample-plugin', 'id comes from the folder name');
      assertEqual(metadata.name, 'Sample Plugin');
      assertEqual(metadata.description, 'A plugin used for validation');
      assertEqual(metadata.version, '1.0.0');
      assertEqual(metadata.author?.name, 'Jane Doe');
      assertEqual(metadata.items!.length, 2);
      assertEqual(metadata.items![0]!.path, 'instructions/sample.instructions.md');
      assertEqual(metadata.items![0]!.kind, 'instruction');
    },
    'parsePluginMetadata: keeps an id from the manifest': () => {
      const metadata = parse({ id: 'custom-id', name: 'Sample Plugin', description: 'A plugin', items: [{ path: 'prompts/sample.md', kind: 'prompt' }] });
      assertEqual(metadata.id, 'custom-id');
    },
    'parsePluginMetadata: rejects a missing name': () => {
      expectInvalid({ description: 'A plugin', items: [{ path: 'sample.md', kind: 'instruction' }] }, 'missing or invalid "name" field');
    },
    'parsePluginMetadata: rejects a blank name': () => {
      expectInvalid({ name: '   ', description: 'A plugin', items: [{ path: 'sample.md', kind: 'instruction' }] }, 'missing or invalid "name" field');
    },
    'parsePluginMetadata: rejects a missing description': () => {
      expectInvalid({ name: 'Sample Plugin', items: [{ path: 'sample.md', kind: 'instruction' }] }, 'missing or invalid "description" field');
    },
    'parsePluginMetadata: rejects a blank description': () => {
      expectInvalid({ name: 'Sample Plugin', description: '', items: [{ path: 'sample.md', kind: 'instruction' }] }, 'missing or invalid "description" field');
    },
    'parsePluginMetadata: rejects a manifest with no item list': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin' }, 'missing or invalid "items" array');
    },
    'parsePluginMetadata: rejects a non-array items field': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin', items: 'not an array' }, 'missing or invalid "items" array');
    },
    'parsePluginMetadata: accepts an empty items array': () => {
      const metadata = parse({ name: 'Sample Plugin', description: 'A plugin', items: [] });
      assertEqual(metadata.id, 'sample-plugin');
      assertEqual(metadata.items!.length, 0);
    },
    'parsePluginMetadata: rejects text that is not JSON': () => {
      expectInvalid('this is not valid json at all {{{', 'not valid JSON');
    },
    'parsePluginMetadata: rejects a null document': () => {
      expectInvalid('null', 'metadata is missing or not an object');
    },
    'parsePluginMetadata: keeps optional fields': () => {
      const metadata = parse({
        name: 'Sample Plugin',
        description: 'A plugin',
        version: '2.0.0',
        author: { name: 'John Smith' },
        repository: 'https://github.com/acme-corp/copilot-tools',
        license: 'MIT',
        featured: true,
        tags: ['testing', 'sample', 'demo'],
        items: [{ path: 'instructions/sample.instructions.md', kind: 'instruction' }],
        display: { ordering: 'custom', show_badge: false },
      });
      assertDeepEqual(metadata.tags, ['testing', 'sample', 'demo']);
      assertEqual(metadata.version, '2.0.0');
      assertEqual(metadata.author?.name, 'John Smith');
      assertEqual(metadata.repository, 'https://github.com/acme-corp/copilot-tools');
      assertEqual(metadata.license, 'MIT');
      assertEqual(metadata.featured, true);
      assertEqual(metadata.display?.ordering, 'custom');
      assertEqual(metadata.display?.show_badge, false);
    },
    'parsePluginMetadata: keeps legacy items of every kind in order': () => {
      const metadata = parse({
        name: 'Multi-Kind Plugin',
        description: 'Plugin with multiple item kinds',
        items: [
          { path: 'instructions/sample.instructions.md', kind: 'instruction' },
          { path: 'prompts/sample.prompt.md', kind: 'prompt' },
          { path: 'agents/helper.agent.md', kind: 'agent' },
          { path: 'skills/analyzer', kind: 'skill' },
          { path: 'hooks/session-logger', kind: 'hook' },
        ],
      });
      assertDeepEqual(metadata.items!.map(item => item.kind), ['instruction', 'prompt', 'agent', 'skill', 'hook']);
    },
    'parsePluginMetadata: rejects an unsupported kind': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin', items: [{ path: 'extensions/board', kind: 'extension' }] }, 'unsupported "kind" value "extension"');
    },
    'parsePluginMetadata: rejects an item without a path': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin', items: [{ kind: 'prompt' }] }, 'missing or has an invalid "path" field');
    },

    // --- parsePluginMetadata: plugin-relative arrays -------------------------
    'parsePluginMetadata: resolves plugin-relative agents and skills to repository paths': () => {
      const metadata = parse({
        name: 'sample-plugin',
        description: 'Meta prompts for discovery',
        agents: ['./agents'],
        skills: ['./skills/suggest-skills', './skills/suggest-instructions'],
      });
      assertEqual(metadata.id, 'sample-plugin');
      assertEqual(metadata.items!.length, 3);
      assertEqual(metadata.items![0]!.kind, 'agent');
      assertEqual(metadata.items![0]!.path, `${PLUGIN_DIR}/agents`);
      assertEqual(metadata.items![1]!.kind, 'skill');
      assertEqual(metadata.items![1]!.path, `${PLUGIN_DIR}/skills/suggest-skills`);
      assertEqual(metadata.items![2]!.path, `${PLUGIN_DIR}/skills/suggest-instructions`);
    },
    'parsePluginMetadata: plugin-relative layout with skills only': () => {
      const metadata = parse({ name: 'Skills Only Plugin', description: 'A plugin with only skills', skills: ['./skills/my-skill'] });
      assertEqual(metadata.items!.length, 1);
      assertEqual(metadata.items![0]!.kind, 'skill');
      assertEqual(metadata.items![0]!.path, `${PLUGIN_DIR}/skills/my-skill`);
    },
    'parsePluginMetadata: strips trailing slashes from plugin-relative paths': () => {
      const metadata = parse({ name: 'Slash Plugin', description: 'Trailing slashes', skills: ['./skills/my-skill/'] });
      assertEqual(metadata.items![0]!.path, `${PLUGIN_DIR}/skills/my-skill`);
    },
    'parsePluginMetadata: plugin-relative layout lists agents, skills, instructions, then prompts': () => {
      const metadata = parse({
        name: 'Ordered Plugin',
        description: 'Every kind',
        prompts: ['./prompts/sample.prompt.md'],
        instructions: ['./instructions/sample.instructions.md'],
        skills: ['./skills/my-skill'],
        agents: ['./agents/helper.agent.md'],
      });
      assertDeepEqual(metadata.items!.map(item => item.kind), ['agent', 'skill', 'instruction', 'prompt']);
    },

    // --- parsePluginMetadata: Agent Plugins layout ---------------------------
    'parsePluginMetadata: maps Agent Plugins entries to repository paths': () => {
      const metadata = parse({
        name: 'sample-plugin',
        description: 'Repository agents, skills, and hooks',
        extensions: {
          [AWESOME_COPILOT_NAMESPACE]: {
            agents: ['./agents/helper.md', './agents/reviewer.agent.md'],
            skills: ['./skills/my-skill/'],
            hooks: ['./hooks/session-logger/'],
          },
        },
      });
      assertEqual(metadata.id, 'sample-plugin');
      assertDeepEqual(metadata.items, [
        { path: 'agents/helper.agent.md', kind: 'agent' },
        { path: 'agents/reviewer.agent.md', kind: 'agent' },
        { path: 'skills/my-skill', kind: 'skill' },
        { path: 'hooks/session-logger', kind: 'hook' },
      ]);
    },
    'parsePluginMetadata: a manifest with only Copilot extensions lists no items': () => {
      const metadata = parse({
        name: 'board-plugin',
        description: 'A canvas extension',
        extensions: { [AWESOME_COPILOT_NAMESPACE]: { extensions: ['./extensions/sample-board'] } },
      });
      assertDeepEqual(metadata.items, []);
    },
    'getSkippedPluginEntries: reports Copilot extensions and unrecognized paths': () => {
      const metadata = parse({
        name: 'mixed-plugin',
        description: 'Entries the downloader skips',
        extensions: {
          [AWESOME_COPILOT_NAMESPACE]: {
            agents: ['./agents/nested/helper.md', './agents/ok.md'],
            skills: ['skills/no-leading-dot'],
            extensions: ['./extensions/sample-board'],
          },
        },
      });
      assertDeepEqual(metadata.items, [{ path: 'agents/ok.agent.md', kind: 'agent' }]);
      assertDeepEqual(getSkippedPluginEntries(metadata), [
        './agents/nested/helper.md (unrecognized agents path)',
        'skills/no-leading-dot (unrecognized skills path)',
        './extensions/sample-board (Copilot extension, not downloaded)',
      ]);
    },
    'getSkippedPluginEntries: nothing to report for the other layouts': () => {
      assertDeepEqual(getSkippedPluginEntries(parse(relativeManifest)), []);
    },
    'KIND_TO_CATEGORY: maps every kind to its tool type': () => {
      assertDeepEqual(KIND_TO_CATEGORY, { instruction: 'instructions', prompt: 'prompts', agent: 'agents', skill: 'skills', hook: 'hooks' });
    },
    'PLUGIN_MANIFEST_PATHS: the folder root comes before .github/plugin': () => {
      assertDeepEqual([...PLUGIN_MANIFEST_PATHS], ['plugin.json', '.github/plugin/plugin.json']);
    },

    // --- parsePluginJson ------------------------------------------------------
    'parsePluginJson: reads plugin.json at the plugin folder root first': async () => {
      cache.clearRepo(repo);
      const text = JSON.stringify(agentPluginsManifest);
      await withFetchStub({ [buildApiUrl(repo, ROOT_MANIFEST)]: fileRoute(ROOT_MANIFEST, text) }, async stub => {
        const parsed = await parsePluginJson(repo, PLUGIN_DIR);
        assertEqual(parsed.manifestPath, ROOT_MANIFEST);
        assertEqual(parsed.rawContent, text);
        assertEqual(parsed.metadata.items!.length, 2);
        assertEqual(stub.calls.length, 1, 'one request');
      });
    },
    'parsePluginJson: falls back to .github/plugin/plugin.json': async () => {
      cache.clearRepo(repo);
      const text = JSON.stringify(relativeManifest);
      await withFetchStub({ [buildApiUrl(repo, LEGACY_MANIFEST)]: fileRoute(LEGACY_MANIFEST, text) }, async stub => {
        const parsed = await parsePluginJson(repo, PLUGIN_DIR);
        assertEqual(parsed.manifestPath, LEGACY_MANIFEST);
        assertEqual(parsed.rawContent, text);
        assertEqual(parsed.metadata.id, 'sample-plugin');
        assertEqual(parsed.metadata.items!.length, 3);
        assertEqual(stub.calls.length, 2, 'the root location is tried first');
      });
    },
    'parsePluginJson: reports a folder without a manifest': async () => {
      cache.clearRepo(repo);
      await withFetchStub({}, async () => {
        const err = await catchAsync(() => parsePluginJson(repo, PLUGIN_DIR));
        assert(err instanceof Error && !(err instanceof GitHubApiError), 'should throw a plain Error');
        assertEqual(
          (err as Error).message,
          `Failed to parse plugin.json: no manifest in '${PLUGIN_DIR}' (looked for plugin.json, .github/plugin/plugin.json)`
        );
      });
    },
    'parsePluginJson: lets other GitHub failures through': async () => {
      cache.clearRepo(repo);
      await withFetchStub({
        [buildApiUrl(repo, ROOT_MANIFEST)]: { status: 403, headers: { 'x-ratelimit-remaining': '0' }, body: { message: 'rate limited' } },
      }, async () => {
        const err = await catchAsync(() => parsePluginJson(repo, PLUGIN_DIR));
        assert(err instanceof GitHubApiError, 'should throw GitHubApiError');
        assertEqual((err as GitHubApiError).isRateLimit, true);
      });
    },
    'parsePluginJson: prefixes manifest problems': async () => {
      cache.clearRepo(repo);
      await withFetchStub({ [buildApiUrl(repo, ROOT_MANIFEST)]: fileRoute(ROOT_MANIFEST, 'not json {{{') }, async () => {
        const err = await catchAsync(() => parsePluginJson(repo, PLUGIN_DIR));
        assertEqual((err as Error).message, 'Failed to parse plugin.json: Invalid plugin.json format: not valid JSON');
      });
    },

    // --- downloadPlugin -------------------------------------------------------
    'downloadPlugin: plugin-relative items land in their category folders': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();
      const staleSkillFile = path.join(dest, '.github', 'skills', 'my-skill', 'stale.md');
      fs.mkdirSync(path.dirname(staleSkillFile), { recursive: true });
      fs.writeFileSync(staleSkillFile, 'old', 'utf-8');

      await withFetchStub(relativeRoutes(relativeManifest), async () => {
        const result = await downloadPlugin(pluginItem(repo), dest);

        assertDeepEqual(result.failed, []);
        assertDeepEqual(result.notices, []);
        assertDeepEqual(result.downloaded, [
          'agent: agents/ (1 files)',
          'skill: my-skill (2 files)',
          'instruction: coding.instructions.md',
        ]);
        assertEqual(result.readmeContent, '# Sample Plugin');
        assertEqual(result.pluginDir, path.join(dest, '.github', 'plugins', 'sample-plugin'));

        const github = path.join(dest, '.github');
        assertEqual(readText(path.join(github, 'agents', 'helper.agent.md')), '# helper');
        assertEqual(readText(path.join(github, 'skills', 'my-skill', 'SKILL.md')), '# skill');
        assertEqual(readText(path.join(github, 'skills', 'my-skill', 'references', 'guide.md')), '# guide');
        assert(!fs.existsSync(staleSkillFile), 'a skill folder is replaced whole');
        assertEqual(readText(path.join(github, 'instructions', 'coding.instructions.md')), '# coding');

        const pluginDir = result.pluginDir;
        assertDeepEqual(JSON.parse(readText(path.join(pluginDir, '.github', 'plugin', 'plugin.json'))), relativeManifest);
        assertEqual(readText(path.join(pluginDir, 'agents', 'helper.agent.md')), '# helper');
        assertEqual(readText(path.join(pluginDir, 'commands', 'do-thing.md')), '# do thing');
        assertEqual(readText(path.join(pluginDir, 'README.md')), '# Sample Plugin');
        assert(!fs.existsSync(path.join(pluginDir, 'skills')), 'only agents/ and commands/ are copied into the plugin folder');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: Agent Plugins items come from the repository folders': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();

      await withFetchStub(agentPluginsRoutes(), async () => {
        const result = await downloadPlugin(pluginItem(repo), dest);

        assertDeepEqual(result.failed, []);
        assertDeepEqual(result.downloaded, ['agent: helper.agent.md', 'skill: my-skill (1 files)']);
        assertDeepEqual(result.notices, ['./extensions/sample-board (Copilot extension, not downloaded)']);
        assertEqual(result.readmeContent, '# Sample Plugin');

        const github = path.join(dest, '.github');
        assertEqual(readText(path.join(github, 'agents', 'helper.agent.md')), '# helper');
        assertEqual(readText(path.join(github, 'skills', 'my-skill', 'SKILL.md')), '# skill');

        const pluginDir = path.join(github, 'plugins', 'sample-plugin');
        assertEqual(result.pluginDir, pluginDir);
        assertDeepEqual(JSON.parse(readText(path.join(pluginDir, 'plugin.json'))), agentPluginsManifest);
        assertEqual(readText(path.join(pluginDir, 'README.md')), '# Sample Plugin');
        assertEqual(readText(path.join(pluginDir, 'mcp.json')), '{ "servers": {} }');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: a failing item is reported and the rest still download': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();
      const manifest = { ...relativeManifest, instructions: ['./instructions/missing.instructions.md'] };

      await withFetchStub(relativeRoutes(manifest), async () => {
        const result = await downloadPlugin(pluginItem(repo), dest);
        assertEqual(result.downloaded.length, 2);
        assertEqual(result.failed.length, 1);
        assert(result.failed[0]!.startsWith(`${PLUGIN_DIR}/instructions/missing.instructions.md (`), result.failed[0]!);
        assert(result.failed[0]!.includes('not found'), result.failed[0]!);
        assert(fs.existsSync(path.join(dest, '.github', 'agents', 'helper.agent.md')), 'the agent still downloads');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: follows the source A.I. folder': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();
      const claudeRepo: RepositorySource = { ...repo, aiFolder: '.claude' };

      await withFetchStub(agentPluginsRoutes(), async () => {
        const result = await downloadPlugin(pluginItem(claudeRepo), dest);
        assertEqual(result.pluginDir, path.join(dest, '.claude', 'plugins', 'sample-plugin'));
        assert(fs.existsSync(path.join(dest, '.claude', 'skills', 'my-skill', 'SKILL.md')), 'skills land under .claude');
        assert(!fs.existsSync(path.join(dest, '.github')), 'nothing lands under .github');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: rejects an item that is not a plugin folder': async () => {
      const agent: CopilotItem = { ...pluginItem(repo), category: 'agents', file: entry('agents/helper.agent.md', 'file') };
      const err = await catchAsync(() => downloadPlugin(agent, tempDir()));
      assert(err instanceof Error && err.message.includes('is not a plugin folder'), String(err));
    },
  });

  cache.clearRepo(repo);
  return result;
}
