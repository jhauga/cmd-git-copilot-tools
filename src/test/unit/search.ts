import { searchTools, filterByCategory, findByCode } from '../../engine/search.js';
import type { CopilotItem } from '../../types.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

function mockItem(name: string, category: CopilotItem['category']): CopilotItem {
  return {
    id: `${category}-${name}`,
    name,
    category,
    repo: { owner: 'test', repo: 'test' },
    file: { name, path: `${category}/${name}`, type: 'file', download_url: null, size: 0, sha: 'abc' },
  };
}

export async function runSearchSuite(): Promise<SuiteResult> {
  return runSuite('unit: search', {
    'searchTools: plain term matches name': () => {
      const items = [mockItem('game-agent.agent.md', 'agents'), mockItem('code-prompt.prompt.md', 'prompts')];
      const results = searchTools(items, 'game');
      assertEqual(results.length, 1);
      assertEqual(results[0]!.name, 'game-agent.agent.md');
    },
    'searchTools: category prefix restricts to that category': () => {
      const items = [
        mockItem('game-agent.agent.md', 'agents'),
        mockItem('game-prompt.prompt.md', 'prompts'),
      ];
      const results = searchTools(items, 'a:game');
      assertEqual(results.length, 1);
      assertEqual(results[0]!.category, 'agents');
    },
    'searchTools: unrecognized prefix uses full term for match': () => {
      // When prefix is not a known category label, the full term (including colon) is searched.
      // Items named 'abc.agent.md' don't contain 'xyz:abc', so 0 results.
      const items = [mockItem('abc.agent.md', 'agents'), mockItem('abc.prompt.md', 'prompts')];
      const results = searchTools(items, 'xyz:abc');
      assertEqual(results.length, 0);
    },
    'searchTools: empty query returns all items': () => {
      const items = [mockItem('a.agent.md', 'agents'), mockItem('b.prompt.md', 'prompts')];
      assertEqual(searchTools(items, '').length, 2);
    },
    'searchTools: comma-separated terms union results': () => {
      const items = [
        mockItem('alpha.agent.md', 'agents'),
        mockItem('beta.prompt.md', 'prompts'),
        mockItem('gamma.skill.md', 'skills'),
      ];
      const results = searchTools(items, 'alpha,beta');
      assertEqual(results.length, 2);
    },
    'searchTools: case-insensitive match': () => {
      const items = [mockItem('MyAgent.agent.md', 'agents')];
      assertEqual(searchTools(items, 'MYAGENT').length, 1);
    },
    'searchTools: no match returns empty array': () => {
      const items = [mockItem('hello.agent.md', 'agents')];
      assertEqual(searchTools(items, 'xyz').length, 0);
    },
    'searchTools: skills label s: prefix works': () => {
      const items = [
        mockItem('game-skill', 'skills'),
        mockItem('game-agent.agent.md', 'agents'),
      ];
      const results = searchTools(items, 's:game');
      assertEqual(results.length, 1);
      assertEqual(results[0]!.category, 'skills');
    },
    'searchTools: plugins label pl: prefix works': () => {
      const items = [
        mockItem('my-plugin', 'plugins'),
        mockItem('my-prompt.prompt.md', 'prompts'),
      ];
      const results = searchTools(items, 'pl:my');
      assertEqual(results.length, 1);
      assertEqual(results[0]!.category, 'plugins');
    },
    'filterByCategory: returns only matching category': () => {
      const items = [
        mockItem('a.agent.md', 'agents'),
        mockItem('b.prompt.md', 'prompts'),
        mockItem('c.agent.md', 'agents'),
      ];
      const results = filterByCategory(items, 'agents');
      assertEqual(results.length, 2);
      assert(results.every(r => r.category === 'agents'), 'all items should be agents');
    },
    'filterByCategory: empty array when no match': () => {
      const items = [mockItem('a.agent.md', 'agents')];
      assertEqual(filterByCategory(items, 'prompts').length, 0);
    },
    'filterByCategory: all six categories work': () => {
      const cats = ['agents', 'instructions', 'plugins', 'prompts', 'skills', 'workflows'] as const;
      for (const cat of cats) {
        const item = mockItem(`item.md`, cat);
        const results = filterByCategory([item], cat);
        assertEqual(results.length, 1, `filterByCategory should find item in ${cat}`);
      }
    },
    'findByCode: all-view with label+number': () => {
      const items = [
        mockItem('first.agent.md', 'agents'),
        mockItem('second.agent.md', 'agents'),
        mockItem('first.prompt.md', 'prompts'),
      ];
      const result = findByCode(items, 'a2', 'all');
      assert(result !== undefined, 'should find second agent');
      assertEqual(result!.name, 'second.agent.md');
    },
    'findByCode: single-category view with number only': () => {
      const items = [
        mockItem('first.prompt.md', 'prompts'),
        mockItem('second.prompt.md', 'prompts'),
      ];
      const result = findByCode(items, '2', 'prompts');
      assert(result !== undefined, 'should find item 2');
      assertEqual(result!.name, 'second.prompt.md');
    },
    'findByCode: out-of-range returns undefined': () => {
      const items = [mockItem('only.agent.md', 'agents')];
      assertEqual(findByCode(items, 'a99', 'all'), undefined);
    },
    'findByCode: index 0 returns undefined': () => {
      const items = [mockItem('only.agent.md', 'agents')];
      assertEqual(findByCode(items, 'a0', 'all'), undefined);
    },
    'findByCode: plugins use pl prefix': () => {
      const items = [mockItem('my-plugin', 'plugins')];
      const result = findByCode(items, 'pl1', 'all');
      assert(result !== undefined, 'should find plugin with pl prefix');
      assertEqual(result!.name, 'my-plugin');
    },
    'findByCode: skills use s prefix': () => {
      const items = [
        mockItem('skill-a', 'skills'),
        mockItem('skill-b', 'skills'),
      ];
      const result = findByCode(items, 's2', 'all');
      assert(result !== undefined, 'should find second skill');
      assertEqual(result!.name, 'skill-b');
    },
    'findByCode: workflows use w prefix': () => {
      const items = [mockItem('my-workflow.yml', 'workflows')];
      const result = findByCode(items, 'w1', 'all');
      assert(result !== undefined, 'should find workflow');
      assertEqual(result!.name, 'my-workflow.yml');
    },
  });
}
