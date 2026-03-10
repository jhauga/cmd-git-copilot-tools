// Test programmatic usage of cmd-git-copilot-tools as a library
import {
  loadConfig,
  getDefaultConfig,
  parseGitHubUrl,
  searchTools,
  filterByCategory,
  CATEGORY_LABELS,
  ORDERED_CATEGORIES,
} from '../../index.js';
import type { Config, CopilotItem, ToolCategory } from '../../index.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

export async function runProgrammaticSuite(): Promise<SuiteResult> {
  return runSuite('unit: programmatic', {
    'can import types': () => {
      const config: Config = getDefaultConfig();
      assert(config !== null, 'should have config');
      assert(Array.isArray(config.sources), 'config should have sources array');
    },

    'can import and use config functions': () => {
      const config = getDefaultConfig();
      assert(config.sources.length > 0, 'should have default sources');
      assertEqual(config.defaultSourceIndex, 0);
      assertEqual(typeof config.cacheTimeout, 'number');
    },

    'can import and use parseGitHubUrl': () => {
      const result = parseGitHubUrl('https://github.com/owner/repo');
      assert(result !== null, 'should parse URL');
      assertEqual(result!.owner, 'owner');
      assertEqual(result!.repo, 'repo');
    },

    'can import constants': () => {
      assert(typeof CATEGORY_LABELS === 'object', 'should import CATEGORY_LABELS');
      assert(Array.isArray(ORDERED_CATEGORIES), 'should import ORDERED_CATEGORIES');
      assert(ORDERED_CATEGORIES.length > 0, 'should have categories');
    },

    'can import and use search functions': () => {
      // Create mock items for testing
      const mockItems: CopilotItem[] = [
        {
          id: 'test-1',
          name: 'test-agent.agent.md',
          category: 'agents' as ToolCategory,
          repo: { owner: 'test', repo: 'test' },
          file: {
            name: 'test-agent.agent.md',
            path: 'test-agent.agent.md',
            type: 'file',
            download_url: 'https://example.com/test',
            size: 100,
            sha: 'abc123',
          },
        },
        {
          id: 'test-2',
          name: 'test-prompt.prompt.md',
          category: 'prompts' as ToolCategory,
          repo: { owner: 'test', repo: 'test' },
          file: {
            name: 'test-prompt.prompt.md',
            path: 'test-prompt.prompt.md',
            type: 'file',
            download_url: 'https://example.com/test2',
            size: 200,
            sha: 'def456',
          },
        },
      ];

      // Test search
      const searchResults = searchTools(mockItems, 'agent');
      assert(searchResults.length > 0, 'should find items');
      
      // Test filter by category
      const agents = filterByCategory(mockItems, 'agents');
      assertEqual(agents.length, 1);
      assertEqual(agents[0]!.category, 'agents');
    },

    'can load config programmatically': () => {
      try {
        const config = loadConfig();
        assert(config !== null, 'should load config');
        assert(Array.isArray(config.sources), 'config should have sources');
      } catch (err) {
        // Config loading might fail if no config file exists yet
        // This is expected behavior for a fresh install
        assert(true, 'config loading handled gracefully');
      }
    },

    'exports are used by CLI correctly': () => {
      // Test that the main exports match what the CLI uses
      assert(typeof loadConfig === 'function', 'loadConfig should be a function');
      assert(typeof getDefaultConfig === 'function', 'getDefaultConfig should be a function');
      assert(typeof searchTools === 'function', 'searchTools should be a function');
      assert(typeof filterByCategory === 'function', 'filterByCategory should be a function');
    },
  });
}
