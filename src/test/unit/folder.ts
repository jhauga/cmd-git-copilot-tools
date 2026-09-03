import * as path from 'path';
import { isAbsolutePath, normalizeAiFolder, resolveAiFolder, resolveCategoryDir } from '../../engine/folder.js';
import { getDefaultConfig, setDefaultFolder } from '../../engine/config.js';
import { parseSetDefaultArgument } from '../../cli.js';
import { AbsoluteFolderPathError, DEFAULT_AI_FOLDER } from '../../types.js';
import type { Config } from '../../types.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

function expectAbsoluteFolderError(fn: () => unknown, message: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof AbsoluteFolderPathError, message);
}

export async function runFolderSuite(): Promise<SuiteResult> {
  return runSuite('unit: folder', {
    'DEFAULT_AI_FOLDER: is .github': () => {
      assertEqual(DEFAULT_AI_FOLDER, '.github');
    },

    // --- isAbsolutePath ---------------------------------------------------
    'isAbsolutePath: POSIX root paths are absolute': () => {
      assert(isAbsolutePath('/tools'), '/tools is absolute');
      assert(isAbsolutePath('/home/demo-user/ai'), 'nested POSIX path is absolute');
    },
    'isAbsolutePath: Windows drive paths are absolute': () => {
      assert(isAbsolutePath('C:\\tools'), 'C:\\tools is absolute');
      assert(isAbsolutePath('c:/tools'), 'c:/tools is absolute');
      assert(isAbsolutePath('D:tools'), 'drive-relative path counts as absolute');
    },
    'isAbsolutePath: UNC shares are absolute': () => {
      assert(isAbsolutePath('\\\\server\\share\\ai'), 'UNC share is absolute');
    },
    'isAbsolutePath: home-anchored paths are absolute': () => {
      assert(isAbsolutePath('~'), 'bare ~ is absolute');
      assert(isAbsolutePath('~/ai'), '~/ai is absolute');
      assert(isAbsolutePath('~\\ai'), '~\\ai is absolute');
    },
    'isAbsolutePath: relative paths are not absolute': () => {
      assert(!isAbsolutePath('.github'), '.github is relative');
      assert(!isAbsolutePath('.claude'), '.claude is relative');
      assert(!isAbsolutePath('docs/ai'), 'docs/ai is relative');
      assert(!isAbsolutePath('./build/ai'), './build/ai is relative');
      assert(!isAbsolutePath('../shared/ai'), '../shared/ai is relative');
      assert(!isAbsolutePath(''), 'empty string is not absolute');
    },
    'isAbsolutePath: detects both conventions on any host platform': () => {
      // path.isAbsolute() only knows the running platform; these must hold everywhere.
      assert(isAbsolutePath('C:\\Users\\demo-user\\ai'), 'Windows path detected on any platform');
      assert(isAbsolutePath('/var/lib/ai'), 'POSIX path detected on any platform');
    },

    // --- normalizeAiFolder ------------------------------------------------
    'normalizeAiFolder: trims surrounding whitespace': () => {
      assertEqual(normalizeAiFolder('  .claude  '), '.claude');
    },
    'normalizeAiFolder: strips trailing separators': () => {
      assertEqual(normalizeAiFolder('.claude/'), '.claude');
      assertEqual(normalizeAiFolder('.claude\\'), '.claude');
      assertEqual(normalizeAiFolder('docs/ai//'), 'docs/ai');
    },
    'normalizeAiFolder: empty and undefined fall back to the default': () => {
      assertEqual(normalizeAiFolder(''), DEFAULT_AI_FOLDER);
      assertEqual(normalizeAiFolder('   '), DEFAULT_AI_FOLDER);
      assertEqual(normalizeAiFolder(undefined), DEFAULT_AI_FOLDER);
    },

    // --- resolveAiFolder precedence ---------------------------------------
    'resolveAiFolder: falls back to .github with nothing configured': () => {
      assertEqual(resolveAiFolder(), DEFAULT_AI_FOLDER);
      assertEqual(resolveAiFolder({}), DEFAULT_AI_FOLDER);
    },
    'resolveAiFolder: config default beats the built-in default': () => {
      assertEqual(resolveAiFolder({ config: { aiFolder: '.claude' } }), '.claude');
    },
    'resolveAiFolder: source aiFolder beats the config default': () => {
      const folder = resolveAiFolder({
        source: { aiFolder: 'docs/ai' },
        config: { aiFolder: '.claude' },
      });
      assertEqual(folder, 'docs/ai');
    },
    'resolveAiFolder: --folder bypasses source and config defaults': () => {
      const folder = resolveAiFolder({
        cliFolder: '.copilot',
        source: { aiFolder: 'docs/ai' },
        config: { aiFolder: '.claude' },
      });
      assertEqual(folder, '.copilot', '--folder wins over every configured default');
    },
    'resolveAiFolder: --folder accepts an absolute path': () => {
      assertEqual(resolveAiFolder({ cliFolder: 'C:\\tools\\ai' }), 'C:\\tools\\ai');
      assertEqual(resolveAiFolder({ cliFolder: '/opt/ai' }), '/opt/ai');
    },
    'resolveAiFolder: blank --folder falls through to the next default': () => {
      const folder = resolveAiFolder({ cliFolder: '   ', config: { aiFolder: '.claude' } });
      assertEqual(folder, '.claude');
    },
    'resolveAiFolder: normalizes the value it returns': () => {
      assertEqual(resolveAiFolder({ cliFolder: ' .claude/ ' }), '.claude');
    },

    // --- resolveCategoryDir -----------------------------------------------
    'resolveCategoryDir: relative folder resolves beneath destDir': () => {
      const dir = resolveCategoryDir(path.join('tmp', 'project'), 'skills', '.claude');
      assertEqual(dir, path.join('tmp', 'project', '.claude', 'skills'));
    },
    'resolveCategoryDir: default folder keeps the .github layout': () => {
      const dir = resolveCategoryDir(path.join('tmp', 'project'), 'agents', undefined);
      assertEqual(dir, path.join('tmp', 'project', '.github', 'agents'));
    },
    'resolveCategoryDir: absolute folder replaces destDir': () => {
      const dir = resolveCategoryDir(path.join('tmp', 'project'), 'prompts', '/opt/ai');
      assertEqual(dir, path.join('/opt/ai', 'prompts'));
      assert(!dir.includes('project'), 'destDir is ignored for absolute folders');
    },
    'resolveCategoryDir: nested relative folder is preserved': () => {
      const dir = resolveCategoryDir('root', 'hooks', 'docs/ai');
      assertEqual(dir, path.join('root', 'docs', 'ai', 'hooks'));
    },
    'resolveCategoryDir: each category still gets a unique folder': () => {
      const dirs = ['agents', 'skills', 'prompts'].map(
        cat => resolveCategoryDir('root', cat as 'agents', '.claude')
      );
      assertEqual(new Set(dirs).size, 3, 'categories do not collide under a custom A.I. folder');
    },

    // --- parseSetDefaultArgument ------------------------------------------
    'parseSetDefaultArgument: folder= qualifier selects the A.I. folder': () => {
      const target = parseSetDefaultArgument('folder=.claude');
      assertEqual(target.kind, 'folder');
      assertEqual(target.value, '.claude');
    },
    'parseSetDefaultArgument: folder= value is trimmed': () => {
      const target = parseSetDefaultArgument('folder=  docs/ai  ');
      assertEqual(target.kind, 'folder');
      assertEqual(target.value, 'docs/ai');
    },
    'parseSetDefaultArgument: empty folder= value is reported as a folder target': () => {
      const target = parseSetDefaultArgument('folder=');
      assertEqual(target.kind, 'folder');
      assertEqual(target.value, '');
    },
    'parseSetDefaultArgument: a label keeps the original source behaviour': () => {
      const target = parseSetDefaultArgument('myrepo');
      assertEqual(target.kind, 'source');
      assertEqual(target.value, 'myrepo');
    },
    'parseSetDefaultArgument: a URL keeps the original source behaviour': () => {
      const target = parseSetDefaultArgument('https://github.com/owner/repo');
      assertEqual(target.kind, 'source');
      assertEqual(target.value, 'https://github.com/owner/repo');
    },
    'parseSetDefaultArgument: qualifier is strict about the word folder': () => {
      assertEqual(parseSetDefaultArgument('folder').kind, 'source', 'no = means a source');
      assertEqual(parseSetDefaultArgument('folders=.claude').kind, 'source', 'folders= is not the qualifier');
      assertEqual(parseSetDefaultArgument('Folder=.claude').kind, 'source', 'qualifier is case-sensitive');
      assertEqual(parseSetDefaultArgument('ai-folder=.claude').kind, 'source', 'prefixed qualifier is not the qualifier');
    },

    // --- setDefaultFolder -------------------------------------------------
    'setDefaultFolder: stores a relative folder on the config': () => {
      const config: Config = getDefaultConfig();
      const stored = setDefaultFolder(config, '.claude');
      assertEqual(stored, '.claude');
      assertEqual(config.aiFolder, '.claude');
    },
    'setDefaultFolder: normalizes the stored value': () => {
      const config: Config = getDefaultConfig();
      setDefaultFolder(config, '  docs/ai/  ');
      assertEqual(config.aiFolder, 'docs/ai');
    },
    'setDefaultFolder: rejects a POSIX absolute path': () => {
      const config: Config = getDefaultConfig();
      expectAbsoluteFolderError(() => setDefaultFolder(config, '/opt/ai'), 'POSIX absolute path rejected');
      assertEqual(config.aiFolder, undefined, 'config is left untouched');
    },
    'setDefaultFolder: rejects a Windows absolute path': () => {
      const config: Config = getDefaultConfig();
      expectAbsoluteFolderError(() => setDefaultFolder(config, 'C:\\Users\\demo-user\\ai'), 'Windows absolute path rejected');
      assertEqual(config.aiFolder, undefined, 'config is left untouched');
    },
    'setDefaultFolder: rejects a home-anchored path': () => {
      const config: Config = getDefaultConfig();
      expectAbsoluteFolderError(() => setDefaultFolder(config, '~/ai'), 'home-anchored path rejected');
    },
    'setDefaultFolder: absolute path error names the --folder alternative': () => {
      const err = new AbsoluteFolderPathError('/opt/ai');
      assertEqual(err.name, 'AbsoluteFolderPathError');
      assert(err.message.includes('/opt/ai'), 'message repeats the offending path');
      assert(err.message.includes('--folder'), 'message points at the --folder option');
    },
    'setDefaultFolder: rejects an empty value': () => {
      const config: Config = getDefaultConfig();
      let threw = false;
      try {
        setDefaultFolder(config, '   ');
      } catch {
        threw = true;
      }
      assert(threw, 'empty folder value is rejected');
    },

    // --- end to end resolution --------------------------------------------
    'end to end: --set-default folder=.claude changes where tools land': () => {
      const config: Config = getDefaultConfig();
      const target = parseSetDefaultArgument('cmd-copilot-tools --set-default folder=.claude'.split(' ').pop()!);
      assertEqual(target.kind, 'folder');
      setDefaultFolder(config, target.value);

      const folder = resolveAiFolder({ config: { aiFolder: config.aiFolder } });
      const dir = resolveCategoryDir('project', 'skills', folder);
      assertEqual(dir, path.join('project', '.claude', 'skills'));
    },
    'end to end: --folder still wins after a default is configured': () => {
      const config: Config = getDefaultConfig();
      setDefaultFolder(config, '.claude');

      const folder = resolveAiFolder({
        cliFolder: '/opt/ai',
        config: { aiFolder: config.aiFolder },
      });
      const dir = resolveCategoryDir('project', 'skills', folder);
      assertEqual(dir, path.join('/opt/ai', 'skills'));
    },
  });
}
