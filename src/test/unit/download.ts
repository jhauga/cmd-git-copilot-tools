import * as path from 'path';
import { getFileSizeDisplay, matchesToolName } from '../../engine/download.js';
import { DOWNLOAD_PATHS, ORDERED_CATEGORIES } from '../../types.js';
import type { ToolCategory } from '../../types.js';
import { runSuite, assert, assertEqual } from '../runner.js';
import type { SuiteResult } from '../runner.js';

export async function runDownloadSuite(): Promise<SuiteResult> {
  return runSuite('unit: download', {
    'getFileSizeDisplay: bytes under 1KB': () => {
      assertEqual(getFileSizeDisplay(0), '0B');
      assertEqual(getFileSizeDisplay(500), '500B');
      assertEqual(getFileSizeDisplay(1023), '1023B');
    },
    'getFileSizeDisplay: exactly 1KB': () => {
      assertEqual(getFileSizeDisplay(1024), '1.0KB');
    },
    'getFileSizeDisplay: kilobytes': () => {
      assertEqual(getFileSizeDisplay(1536), '1.5KB');
      assertEqual(getFileSizeDisplay(2048), '2.0KB');
    },
    'getFileSizeDisplay: exactly 1MB': () => {
      assertEqual(getFileSizeDisplay(1024 * 1024), '1.0MB');
    },
    'getFileSizeDisplay: megabytes': () => {
      assertEqual(getFileSizeDisplay(1572864), '1.5MB');
    },
    'DOWNLOAD_PATHS: all six categories have paths': () => {
      const categories: ToolCategory[] = ['agents', 'instructions', 'plugins', 'prompts', 'skills', 'workflows'];
      for (const cat of categories) {
        assert(typeof DOWNLOAD_PATHS[cat] === 'string', `${cat} should have a download path`);
        assert(DOWNLOAD_PATHS[cat].startsWith('.github/'), `${cat} path should start with .github/`);
      }
    },
    'DOWNLOAD_PATHS: agents is .github/agents': () => {
      assertEqual(DOWNLOAD_PATHS['agents'], '.github/agents');
    },
    'DOWNLOAD_PATHS: instructions is .github/instructions': () => {
      assertEqual(DOWNLOAD_PATHS['instructions'], '.github/instructions');
    },
    'DOWNLOAD_PATHS: plugins is .github/plugins': () => {
      assertEqual(DOWNLOAD_PATHS['plugins'], '.github/plugins');
    },
    'DOWNLOAD_PATHS: prompts is .github/prompts': () => {
      assertEqual(DOWNLOAD_PATHS['prompts'], '.github/prompts');
    },
    'DOWNLOAD_PATHS: skills is .github/skills': () => {
      assertEqual(DOWNLOAD_PATHS['skills'], '.github/skills');
    },
    'DOWNLOAD_PATHS: workflows is .github/workflows': () => {
      assertEqual(DOWNLOAD_PATHS['workflows'], '.github/workflows');
    },
    'ORDERED_CATEGORIES: has all six categories': () => {
      assertEqual(ORDERED_CATEGORIES.length, 6);
      const expected = ['agents', 'instructions', 'plugins', 'prompts', 'skills', 'workflows'];
      for (const cat of expected) {
        assert(ORDERED_CATEGORIES.includes(cat as ToolCategory), `ORDERED_CATEGORIES should include ${cat}`);
      }
    },
    'download path composition: destDir + categoryPath + filename': () => {
      const destDir = path.join('tmp', 'test');
      const categoryPath = DOWNLOAD_PATHS['agents'];
      const name = 'my-agent.agent.md';
      const composed = path.join(destDir, categoryPath, name);
      assert(composed.endsWith('my-agent.agent.md'), 'path should end with filename');
      assert(composed.includes('.github'), 'path should include .github dir');
      assert(composed.includes('agents'), 'path should include category dir');
    },
    'download path composition: each category resolves unique subfolder': () => {
      const destDir = '/tmp/test';
      const paths = ORDERED_CATEGORIES.map(cat => path.join(destDir, DOWNLOAD_PATHS[cat]));
      const unique = new Set(paths);
      assertEqual(unique.size, ORDERED_CATEGORIES.length, 'each category should have a unique download path');
    },
    'matchesToolName: exact match with full extension': () => {
      assert(matchesToolName('my-agent.agent.md', 'my-agent.agent.md'), 'exact agent match');
      assert(matchesToolName('my-prompt.prompt.md', 'my-prompt.prompt.md'), 'exact prompt match');
      assert(matchesToolName('my-flow.workflow.md', 'my-flow.workflow.md'), 'exact workflow match');
    },
    'matchesToolName: bare name matches .agent.md (singular)': () => {
      assert(matchesToolName('my-agent.agent.md', 'my-agent'), 'bare name matches .agent.md');
      assert(!matchesToolName('other-agent.agent.md', 'my-agent'), 'non-matching agent returns false');
    },
    'matchesToolName: bare name matches .agents.md (plural)': () => {
      assert(matchesToolName('my-agent.agents.md', 'my-agent'), 'bare name matches .agents.md');
    },
    'matchesToolName: bare name matches .instruction.md (singular)': () => {
      assert(matchesToolName('html-css-style-color-guide.instruction.md', 'html-css-style-color-guide'), 'bare name matches .instruction.md');
    },
    'matchesToolName: bare name matches .instructions.md (plural)': () => {
      assert(matchesToolName('html-css-style-color-guide.instructions.md', 'html-css-style-color-guide'), 'bare name matches .instructions.md');
      assert(matchesToolName('update-code-from-shorthand.instructions.md', 'update-code-from-shorthand'), 'bare name matches .instructions.md');
      assert(matchesToolName('update-docs-on-code-change.instructions.md', 'update-docs-on-code-change'), 'bare name matches .instructions.md');
    },
    'matchesToolName: bare name matches .prompt.md (singular)': () => {
      assert(matchesToolName('my-prompt.prompt.md', 'my-prompt'), 'bare name matches .prompt.md');
    },
    'matchesToolName: bare name matches .prompts.md (plural)': () => {
      assert(matchesToolName('my-prompt.prompts.md', 'my-prompt'), 'bare name matches .prompts.md');
    },
    'matchesToolName: bare name matches .workflow.md (singular)': () => {
      assert(matchesToolName('my-flow.workflow.md', 'my-flow'), 'bare name matches .workflow.md');
    },
    'matchesToolName: bare name matches .workflows.md (plural)': () => {
      assert(matchesToolName('my-flow.workflows.md', 'my-flow'), 'bare name matches .workflows.md');
    },
    'matchesToolName: bare name matches plain .md': () => {
      assert(matchesToolName('my-tool.md', 'my-tool'), 'bare name matches plain .md');
    },
    'matchesToolName: case-insensitive matching': () => {
      assert(matchesToolName('My-Agent.Agent.MD', 'my-agent'), 'case-insensitive match');
      assert(matchesToolName('HTML-CSS-Style-Color-Guide.Instructions.MD', 'html-css-style-color-guide'), 'case-insensitive plural instructions match');
    },
    'matchesToolName: multiple names across categories': () => {
      const items = [
        'html-css-style-color-guide.instructions.md',
        'update-code-from-shorthand.instructions.md',
        'update-docs-on-code-change.instructions.md',
      ];
      const names = ['html-css-style-color-guide', 'update-code-from-shorthand', 'update-docs-on-code-change'];
      for (const name of names) {
        const matched = items.filter(item => matchesToolName(item, name));
        assertEqual(matched.length, 1, `exactly one match for '${name}'`);
      }
    },
    'matchesToolName: no false positives across categories': () => {
      assert(!matchesToolName('my-agent.agent.md', 'other-agent'), 'no false positive for agent');
      assert(!matchesToolName('my-prompt.prompt.md', 'my-agent'), 'no cross-category false positive');
      assert(!matchesToolName('my-flow.workflow.md', 'my-flo'), 'partial name does not match');
    },
  });
}
