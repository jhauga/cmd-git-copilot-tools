import { parseUseSource, resolveUseSource } from '../../cli.js';
import { getDefaultConfig } from '../../engine/config.js';
import type { Config } from '../../types.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

function makeConfig(): Config {
  const config = getDefaultConfig();
  // Add a test source with a label for testing
  config.sources.push({
    owner: 'test',
    repo: 'myrepo',
    label: 'testlabel',
  });
  config.sources.push({
    owner: 'test',
    repo: 'repo-with-branch',
    label: 'branchrepo',
    branch: 'main',
  });
  return config;
}

export async function runCliSuite(): Promise<SuiteResult> {
  return runSuite('unit: cli', {
    'parseUseSource: simple label with no path': () => {
      const result = parseUseSource('mylabel');
      assertEqual(result.base, 'mylabel');
      assertEqual(result.appendedPath, undefined);
    },
    'parseUseSource: label with single path segment': () => {
      const result = parseUseSource('mylabel/develop');
      assertEqual(result.base, 'mylabel');
      assertEqual(result.appendedPath, 'develop');
    },
    'parseUseSource: label with multiple path segments': () => {
      const result = parseUseSource('mylabel/feature/branch');
      assertEqual(result.base, 'mylabel');
      assertEqual(result.appendedPath, 'feature/branch');
    },
    'parseUseSource: GitHub URL without appended path': () => {
      const result = parseUseSource('https://github.com/owner/repo');
      assertEqual(result.base, 'https://github.com/owner/repo');
      assertEqual(result.appendedPath, undefined);
    },
    'parseUseSource: GitHub URL with branch in URL': () => {
      const result = parseUseSource('https://github.com/owner/repo/tree/main');
      // Branch in URL is handled by parseGitHubUrl, not as appended path
      assertEqual(result.base, 'https://github.com/owner/repo');
      assertEqual(result.appendedPath, undefined);
    },
    'parseUseSource: handles empty appended path': () => {
      const result = parseUseSource('mylabel/');
      assertEqual(result.base, 'mylabel');
      assertEqual(result.appendedPath, undefined);
    },
    'resolveUseSource: finds source by label without path': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'testlabel');
      assert(result !== undefined, 'should find source by label');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, undefined);
    },
    'resolveUseSource: appends path to source without existing branch': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'testlabel/develop');
      assert(result !== undefined, 'should find and modify source');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'develop');
    },
    'resolveUseSource: appends path to existing branch': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'branchrepo/feature/tools');
      assert(result !== undefined, 'should find and modify source');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'repo-with-branch');
      assertEqual(result!.branch, 'main/feature/tools');
    },
    'resolveUseSource: returns undefined for unknown label': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'unknownlabel');
      assertEqual(result, undefined);
    },
    'resolveUseSource: returns undefined for unknown label with path': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'unknownlabel/develop');
      assertEqual(result, undefined);
    },
    'resolveUseSource: finds by owner/repo with appended path': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'test/myrepo/feature');
      assert(result !== undefined, 'should find source by owner/repo');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'feature');
    },
    'resolveUseSource: preserves original source object': () => {
      const config = makeConfig();
      const original = config.sources.find(s => s.label === 'testlabel');
      const result = resolveUseSource(config, 'testlabel/develop');
      assert(result !== undefined, 'should find source');
      // Original should not be modified
      assertEqual(original!.branch, undefined);
      // Result should have the appended path
      assertEqual(result!.branch, 'develop');
    },
    'resolveUseSource: handles /tree/ syntax in label path': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, 'testlabel/tree/develop');
      assert(result !== undefined, 'should find source and extract branch after /tree/');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'develop');
    },
    'resolveUseSource: handles URL with branch': () => {
      const config = makeConfig();
      // Add a source that matches the URL
      config.sources.push({
        owner: 'github',
        repo: 'awesome',
        label: 'awesome',
      });
      const result = resolveUseSource(config, 'https://github.com/github/awesome/tree/feature-branch');
      assert(result !== undefined, 'should find source and apply branch from URL');
      assertEqual(result!.owner, 'github');
      assertEqual(result!.repo, 'awesome');
      assertEqual(result!.branch, 'feature-branch');
    },
    'resolveUseSource: handles URL without branch in configured source': () => {
      const config = makeConfig();
      config.sources.push({
        owner: 'github',
        repo: 'test',
        label: 'ghtest',
      });
      const result = resolveUseSource(config, 'https://github.com/github/test');
      assert(result !== undefined, 'should find source without branch');
      assertEqual(result!.owner, 'github');
      assertEqual(result!.repo, 'test');
      assertEqual(result!.branch, undefined);
    },
    'resolveUseSource: finds source by numeric index (1-based)': () => {
      const config = makeConfig();
      // Config has default sources plus 2 added in makeConfig()
      // Index 1 = first default source (github/awesome-copilot)
      const result = resolveUseSource(config, '1');
      assert(result !== undefined, 'should find source by index 1');
      assertEqual(result!.owner, 'github');
      assertEqual(result!.repo, 'awesome-copilot');
    },
    'resolveUseSource: finds source by numeric index with appended path': () => {
      const config = makeConfig();
      // Index 3 = first test source (test/myrepo with label 'testlabel')
      const result = resolveUseSource(config, '3/develop');
      assert(result !== undefined, 'should find source by index 3 with appended path');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'develop');
    },
    'resolveUseSource: numeric index with multiple path segments': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, '3/feature/tools');
      assert(result !== undefined, 'should find source with multi-segment path');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'feature/tools');
    },
    'resolveUseSource: numeric index appends to existing branch': () => {
      const config = makeConfig();
      // Index 4 = test source with branch 'main' (branchrepo)
      const result = resolveUseSource(config, '4/feature');
      assert(result !== undefined, 'should find source and append to existing branch');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'repo-with-branch');
      assertEqual(result!.branch, 'main/feature');
    },
    'resolveUseSource: returns undefined for invalid numeric index (zero)': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, '0');
      assertEqual(result, undefined, 'index 0 is invalid (1-based indexing)');
    },
    'resolveUseSource: returns undefined for out-of-bounds numeric index': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, '999');
      assertEqual(result, undefined, 'index 999 should be out of bounds');
    },
    'resolveUseSource: preserves original when using numeric index with path': () => {
      const config = makeConfig();
      const original = config.sources[2]; // Third source (test/myrepo)
      const result = resolveUseSource(config, '3/custom-branch');
      assert(result !== undefined, 'should find source');
      assertEqual(original!.branch, undefined, 'original should not be modified');
      assertEqual(result!.branch, 'custom-branch', 'result should have appended branch');
    },
    'resolveUseSource: handles /tree/ syntax in numeric index path': () => {
      const config = makeConfig();
      const result = resolveUseSource(config, '3/tree/develop');
      assert(result !== undefined, 'should find source and strip /tree/ from numeric path');
      assertEqual(result!.owner, 'test');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'develop', 'branch should not include "tree/"');
    },
  });
}
