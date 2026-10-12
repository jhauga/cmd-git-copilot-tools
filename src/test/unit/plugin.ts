import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  KIND_TO_CATEGORY,
  PLUGIN_JSON_RELATIVE_PATH,
  downloadPlugin,
  parsePluginJson,
  parsePluginMetadata,
} from '../../engine/plugin.js';
import type { PluginMetadata } from '../../engine/plugin.js';
import { buildApiUrl } from '../../engine/github.js';
import { cache } from '../../engine/cache.js';
import type { CopilotItem, GitHubFileEntry, RepositorySource } from '../../types.js';
import { toBase64, withFetchStub } from '../stub.js';
import type { StubRoute } from '../stub.js';
import { runSuite, assert, assertEqual, assertDeepEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

const repo: RepositorySource = { owner: 'acme-corp', repo: 'copilot-tools' };
const PLUGIN_DIR = 'plugins/sample-plugin';
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

function pluginItem(source: RepositorySource): CopilotItem {
  return {
    id: `${source.owner}/${source.repo}/plugins/sample-plugin`,
    name: 'sample-plugin',
    category: 'plugins',
    repo: source,
    file: entry(PLUGIN_DIR, 'dir'),
  };
}

const sampleManifest = {
  name: 'Sample Plugin',
  description: 'Bundles a few tools',
  version: '1.0.0',
  agents: ['./agents'],
  skills: ['./skills/my-skill'],
  instructions: ['./instructions/coding.instructions.md'],
};

/** Every URL a full download of the sample plugin requests. */
function sampleRoutes(manifest: object): Record<string, StubRoute> {
  const manifestPath = `${PLUGIN_DIR}/${PLUGIN_JSON_RELATIVE_PATH}`;
  return {
    [buildApiUrl(repo, manifestPath)]: fileRoute(manifestPath, JSON.stringify(manifest)),
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
    // --- parsePluginMetadata: legacy layout --------------------------------
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
    'parsePluginMetadata: keeps items of every kind in order': () => {
      const metadata = parse({
        name: 'Multi-Kind Plugin',
        description: 'Plugin with multiple item kinds',
        items: [
          { path: 'instructions/sample.instructions.md', kind: 'instruction' },
          { path: 'prompts/sample.prompt.md', kind: 'prompt' },
          { path: 'agents/helper.agent.md', kind: 'agent' },
          { path: 'skills/analyzer', kind: 'skill' },
        ],
      });
      assertDeepEqual(metadata.items!.map(item => item.kind), ['instruction', 'prompt', 'agent', 'skill']);
    },
    'parsePluginMetadata: rejects an unsupported kind': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin', items: [{ path: 'hooks/sample', kind: 'hook' }] }, 'unsupported "kind" value "hook"');
    },
    'parsePluginMetadata: rejects an item without a path': () => {
      expectInvalid({ name: 'Sample Plugin', description: 'A plugin', items: [{ kind: 'prompt' }] }, 'missing or has an invalid "path" field');
    },

    // --- parsePluginMetadata: current layout -------------------------------
    'parsePluginMetadata: resolves current-layout agents and skills to repository paths': () => {
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
    'parsePluginMetadata: current layout with skills only': () => {
      const metadata = parse({ name: 'Skills Only Plugin', description: 'A plugin with only skills', skills: ['./skills/my-skill'] });
      assertEqual(metadata.items!.length, 1);
      assertEqual(metadata.items![0]!.kind, 'skill');
      assertEqual(metadata.items![0]!.path, `${PLUGIN_DIR}/skills/my-skill`);
    },
    'parsePluginMetadata: strips trailing slashes from current-layout paths': () => {
      const metadata = parse({ name: 'Slash Plugin', description: 'Trailing slashes', skills: ['./skills/my-skill/'] });
      assertEqual(metadata.items![0]!.path, `${PLUGIN_DIR}/skills/my-skill`);
    },
    'parsePluginMetadata: current layout lists agents, skills, instructions, then prompts': () => {
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
    'KIND_TO_CATEGORY: maps every kind to its tool type': () => {
      assertDeepEqual(KIND_TO_CATEGORY, { instruction: 'instructions', prompt: 'prompts', agent: 'agents', skill: 'skills' });
    },

    // --- parsePluginJson ---------------------------------------------------
    'parsePluginJson: fetches the manifest and returns the raw text': async () => {
      cache.clearRepo(repo);
      const manifestPath = `${PLUGIN_DIR}/${PLUGIN_JSON_RELATIVE_PATH}`;
      const text = JSON.stringify(sampleManifest);
      await withFetchStub({ [buildApiUrl(repo, manifestPath)]: fileRoute(manifestPath, text) }, async () => {
        const parsed = await parsePluginJson(repo, PLUGIN_DIR);
        assertEqual(parsed.rawContent, text);
        assertEqual(parsed.metadata.id, 'sample-plugin');
        assertEqual(parsed.metadata.items!.length, 3);
      });
    },
    'parsePluginJson: prefixes manifest problems': async () => {
      cache.clearRepo(repo);
      const manifestPath = `${PLUGIN_DIR}/${PLUGIN_JSON_RELATIVE_PATH}`;
      await withFetchStub({ [buildApiUrl(repo, manifestPath)]: fileRoute(manifestPath, 'not json {{{') }, async () => {
        let message = '';
        try {
          await parsePluginJson(repo, PLUGIN_DIR);
        } catch (err) {
          message = err instanceof Error ? err.message : String(err);
        }
        assertEqual(message, 'Failed to parse plugin.json: Invalid plugin.json format: not valid JSON');
      });
    },

    // --- downloadPlugin ----------------------------------------------------
    'downloadPlugin: writes items to their category folders and the plugin folder': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();
      const staleSkillFile = path.join(dest, '.github', 'skills', 'my-skill', 'stale.md');
      fs.mkdirSync(path.dirname(staleSkillFile), { recursive: true });
      fs.writeFileSync(staleSkillFile, 'old', 'utf-8');

      await withFetchStub(sampleRoutes(sampleManifest), async () => {
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
        const manifest = JSON.parse(readText(path.join(pluginDir, '.github', 'plugin', 'plugin.json'))) as PluginMetadata;
        assertEqual(manifest.id, 'sample-plugin');
        assertEqual(manifest.items!.length, 3);
        assertEqual(readText(path.join(pluginDir, 'agents', 'helper.agent.md')), '# helper');
        assertEqual(readText(path.join(pluginDir, 'commands', 'do-thing.md')), '# do thing');
        assertEqual(readText(path.join(pluginDir, 'README.md')), '# Sample Plugin');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: a failing item is reported and the rest still download': async () => {
      cache.clearRepo(repo);
      const dest = tempDir();
      const manifest = { ...sampleManifest, instructions: ['./instructions/missing.instructions.md'] };

      await withFetchStub(sampleRoutes(manifest), async () => {
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

      await withFetchStub(sampleRoutes(sampleManifest), async () => {
        const result = await downloadPlugin(pluginItem(claudeRepo), dest);
        assertEqual(result.pluginDir, path.join(dest, '.claude', 'plugins', 'sample-plugin'));
        assert(fs.existsSync(path.join(dest, '.claude', 'skills', 'my-skill', 'SKILL.md')), 'skills land under .claude');
        assert(!fs.existsSync(path.join(dest, '.github')), 'nothing lands under .github');
      });

      fs.rmSync(dest, { recursive: true, force: true });
    },
    'downloadPlugin: rejects an item that is not a plugin folder': async () => {
      const agent: CopilotItem = { ...pluginItem(repo), category: 'agents', file: entry('agents/helper.agent.md', 'file') };
      let message = '';
      try {
        await downloadPlugin(agent, tempDir());
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      assert(message.includes('is not a plugin folder'), message);
    },
  });

  cache.clearRepo(repo);
  return result;
}
