import {
  parseGitHubUrl,
  addSource,
  findSource,
  removeSource,
  setDefaultSource,
  getDefaultConfig,
} from '../../engine/config.js';
import type { Config } from '../../types.js';
import { runSuite, assert, assertEqual, assertThrows } from '../runner.js';
import type { SuiteResult } from '../runner.js';

function makeConfig(): Config {
  return getDefaultConfig();
}

export async function runConfigSuite(): Promise<SuiteResult> {
  return runSuite('unit: config', {
    'parseGitHubUrl: standard github URL': () => {
      const result = parseGitHubUrl('https://github.com/owner/repo');
      assert(result !== null, 'should parse standard URL');
      assertEqual(result!.owner, 'owner');
      assertEqual(result!.repo, 'repo');
      assertEqual(result!.baseUrl, undefined);
      assertEqual(result!.branch, undefined);
    },
    'parseGitHubUrl: URL with .git suffix': () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git');
      assert(result !== null, 'should parse URL with .git');
      assertEqual(result!.repo, 'repo');
    },
    'parseGitHubUrl: URL with branch via /tree/': () => {
      const result = parseGitHubUrl('https://github.com/owner/repo/tree/main');
      assert(result !== null, 'should parse URL with branch');
      assertEqual(result!.branch, 'main');
    },
    'parseGitHubUrl: enterprise URL sets baseUrl': () => {
      const result = parseGitHubUrl('https://github.example.com/owner/repo');
      assert(result !== null, 'should parse enterprise URL');
      assertEqual(result!.baseUrl, 'https://github.example.com');
      assertEqual(result!.owner, 'owner');
    },
    'parseGitHubUrl: invalid URL returns null': () => {
      assertEqual(parseGitHubUrl('not-a-url'), null);
    },
    'parseGitHubUrl: URL with only one path segment returns null': () => {
      assertEqual(parseGitHubUrl('https://github.com/owner'), null);
    },
    'parseGitHubUrl: http URL is accepted': () => {
      const result = parseGitHubUrl('http://github.com/owner/repo');
      assert(result !== null, 'should accept http://');
    },
    'getDefaultConfig: has default sources': () => {
      const config = getDefaultConfig();
      assert(config.sources.length >= 1, 'should have at least one default source');
      assertEqual(config.defaultSourceIndex, 0);
      assertEqual(config.cacheTimeout, 3600000);
      assertEqual(config.logLevel, 'info');
      assertEqual(config.checkForUpdates, true);
    },
    'addSource: adds a new source to config': () => {
      const config = makeConfig();
      const before = config.sources.length;
      addSource(config, 'https://github.com/newowner/newrepo');
      assertEqual(config.sources.length, before + 1);
      const added = config.sources[config.sources.length - 1]!;
      assertEqual(added.owner, 'newowner');
      assertEqual(added.repo, 'newrepo');
    },
    'addSource: sets label when provided': () => {
      const config = makeConfig();
      addSource(config, 'https://github.com/newowner/newrepo', 'My Repo');
      const added = config.sources[config.sources.length - 1]!;
      assertEqual(added.label, 'My Repo');
    },
    'addSource: sets branch from URL': () => {
      const config = makeConfig();
      addSource(config, 'https://github.com/newowner/newrepo/tree/develop');
      const added = config.sources[config.sources.length - 1]!;
      assertEqual(added.branch, 'develop');
    },
    'addSource: throws on duplicate owner/repo': () => {
      const config = makeConfig();
      assertThrows(
        () => { addSource(config, 'https://github.com/github/awesome-copilot'); },
        'should throw for duplicate source'
      );
    },
    'addSource: throws on invalid URL': () => {
      const config = makeConfig();
      assertThrows(
        () => { addSource(config, 'not-a-url'); },
        'should throw for invalid URL'
      );
    },
    'findSource: finds by label case-insensitively': () => {
      const config = makeConfig();
      const found = findSource(config, 'github awesome copilot');
      assert(found !== undefined, 'should find source by label');
      assertEqual(found!.owner, 'github');
    },
    'findSource: finds by owner/repo string': () => {
      const config = makeConfig();
      const found = findSource(config, 'github/awesome-copilot');
      assert(found !== undefined, 'should find by owner/repo');
    },
    'findSource: finds by full GitHub URL': () => {
      const config = makeConfig();
      const found = findSource(config, 'https://github.com/github/awesome-copilot');
      assert(found !== undefined, 'should find by full URL');
    },
    'findSource: returns undefined for unknown source': () => {
      const config = makeConfig();
      assertEqual(findSource(config, 'nobody/nothing'), undefined);
    },
    'removeSource: removes an existing source': () => {
      const config = makeConfig();
      addSource(config, 'https://github.com/extra/repo');
      const before = config.sources.length;
      removeSource(config, 'extra/repo');
      assertEqual(config.sources.length, before - 1);
      assertEqual(findSource(config, 'extra/repo'), undefined);
    },
    'removeSource: throws when only one source left': () => {
      const config = makeConfig();
      while (config.sources.length > 1) {
        config.sources.pop();
      }
      assertThrows(
        () => { removeSource(config, `${config.sources[0]!.owner}/${config.sources[0]!.repo}`); },
        'should throw when only one source remains'
      );
    },
    'setDefaultSource: updates defaultSourceIndex': () => {
      const config = makeConfig();
      assert(config.sources.length >= 2, 'need 2+ sources to test setDefault');
      const second = config.sources[1]!;
      const identifier = second.label ?? `${second.owner}/${second.repo}`;
      setDefaultSource(config, identifier);
      assertEqual(config.defaultSourceIndex, 1);
    },
    'setDefaultSource: throws for unknown source': () => {
      const config = makeConfig();
      assertThrows(
        () => { setDefaultSource(config, 'nobody/nothing'); },
        'should throw for unknown source'
      );
    },
    'parseGitHubUrl: --url option use case with standard URL': () => {
      const url = 'https://github.com/myorg/myrepo';
      const result = parseGitHubUrl(url);
      assert(result !== null, '--url should accept standard GitHub URL');
      assertEqual(result!.owner, 'myorg');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.baseUrl, undefined);
      assertEqual(result!.branch, undefined);
    },
    'parseGitHubUrl: --url option use case with branch': () => {
      const url = 'https://github.com/myorg/myrepo/tree/feature-branch';
      const result = parseGitHubUrl(url);
      assert(result !== null, '--url should accept URL with branch');
      assertEqual(result!.owner, 'myorg');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.branch, 'feature-branch');
    },
    'parseGitHubUrl: --url option use case with enterprise URL': () => {
      const url = 'https://github.enterprise.com/myorg/myrepo';
      const result = parseGitHubUrl(url);
      assert(result !== null, '--url should accept enterprise URL');
      assertEqual(result!.owner, 'myorg');
      assertEqual(result!.repo, 'myrepo');
      assertEqual(result!.baseUrl, 'https://github.enterprise.com');
    },
    'parseGitHubUrl: --url option rejects invalid URL': () => {
      const invalidUrl = 'not-a-valid-url';
      const result = parseGitHubUrl(invalidUrl);
      assertEqual(result, null, '--url should reject invalid URLs');
    },
  });
}
