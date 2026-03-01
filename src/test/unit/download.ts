import * as path from 'path';
import { getFileSizeDisplay } from '../../engine/download.js';
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
  });
}
