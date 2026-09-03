import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../engine/config.js';
import { getToken, fetchAllToolsFromSources } from '../engine/github.js';
import { filterByCategory } from '../engine/search.js';
import { downloadItem } from '../engine/download.js';
import { resolveAiFolder, resolveCategoryDir } from '../engine/folder.js';
import { ORDERED_CATEGORIES } from '../types.js';
import type { CopilotItem, ToolCategory } from '../types.js';
import { runSuite, assert, assertEqual } from './runner.js';
import type { SuiteResult } from './runner.js';

function getTempDir(): string {
  return path.join(os.tmpdir(), 'cmd-git-copilot-tools', 'test');
}

function cleanTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function pickRandom<T>(arr: T[], count: number): { indices: number[]; items: T[] } {
  if (arr.length === 0) {
    return { indices: [], items: [] };
  }
  const n = Math.min(count, arr.length);
  const usedSet = new Set<number>();
  while (usedSet.size < n) {
    usedSet.add(Math.floor(Math.random() * arr.length));
  }
  // Convert 0-based set to sorted 1-based indices
  const indices = Array.from(usedSet)
    .sort((a, b) => a - b)
    .map(i => i + 1);
  return {
    indices,
    items: indices.map(i => arr[i - 1]!),
  };
}

export async function runFullTest(): Promise<SuiteResult> {
  const tempDir = getTempDir();

  // Shared state across sequential test cases
  let allItems: CopilotItem[] = [];
  // selectedIndices[categoryIndex] = array of 1-based indices
  const selectedIndices: number[][] = [];
  // selectedNames[categoryIndex] = array of tool names corresponding to each index
  const selectedNames: string[][] = [];
  let token: string | undefined;

  const tests: Record<string, () => Promise<void> | void> = {};

  tests['fetch all tools from configured sources'] = async () => {
    const config = loadConfig();
    token = getToken(undefined, config.enterpriseToken);
    allItems = await fetchAllToolsFromSources(config.sources, token, config.cacheTimeout);
    assert(allItems.length > 0, 'should fetch at least one tool from configured sources');
  };

  tests['generate 5 random 1-based indices per category'] = () => {
    for (const category of ORDERED_CATEGORIES) {
      const catItems = filterByCategory(allItems, category);
      const { indices, items } = pickRandom(catItems, 5);
      selectedIndices.push(indices);
      selectedNames.push(items.map(i => i.name));
    }

    assertEqual(selectedIndices.length, ORDERED_CATEGORIES.length,
      'should have one index array per category');
    assertEqual(selectedNames.length, ORDERED_CATEGORIES.length,
      'should have one name array per category');

    for (let c = 0; c < ORDERED_CATEGORIES.length; c++) {
      const cat = ORDERED_CATEGORIES[c]!;
      const catItems = filterByCategory(allItems, cat);
      const indices = selectedIndices[c]!;

      assert(indices.length <= 5, `${cat}: should select at most 5 items`);
      assert(indices.length <= catItems.length, `${cat}: cannot select more than available items`);
      assertEqual(indices.length, selectedNames[c]!.length,
        `${cat}: indices and names arrays must be same length`);

      // All indices must be 1-based
      for (const idx of indices) {
        assert(idx >= 1, `${cat}: index ${idx} must be >= 1`);
        assert(idx <= catItems.length, `${cat}: index ${idx} must be <= ${catItems.length}`);
      }

      // Indices must be unique
      const uniqueSet = new Set(indices);
      assertEqual(uniqueSet.size, indices.length, `${cat}: indices must be unique`);
    }
  };

  tests['random indices map to correct tool names'] = () => {
    for (let c = 0; c < ORDERED_CATEGORIES.length; c++) {
      const cat = ORDERED_CATEGORIES[c] as ToolCategory;
      const catItems = filterByCategory(allItems, cat);
      const indices = selectedIndices[c]!;
      const names = selectedNames[c]!;

      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i]!;
        const expectedName = catItems[idx - 1]?.name;
        assertEqual(names[i], expectedName,
          `${cat} index ${idx} should map to name '${expectedName}'`);
      }
    }
  };

  tests['download selected items to OS temp folder'] = async () => {
    cleanTempDir(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });

    for (let c = 0; c < ORDERED_CATEGORIES.length; c++) {
      const cat = ORDERED_CATEGORIES[c] as ToolCategory;
      const catItems = filterByCategory(allItems, cat);
      const indices = selectedIndices[c]!;

      for (const oneBasedIdx of indices) {
        const item = catItems[oneBasedIdx - 1];
        if (!item) {continue;}
        const meta = await downloadItem(item, tempDir, token);
        assert(
          fs.existsSync(meta.localPath),
          `downloaded item should exist at: ${meta.localPath}`
        );
      }
    }
  };

  tests['verify downloaded files match selected names'] = () => {
    for (let c = 0; c < ORDERED_CATEGORIES.length; c++) {
      const cat = ORDERED_CATEGORIES[c] as ToolCategory;
      const catItems = filterByCategory(allItems, cat);
      const indices = selectedIndices[c]!;
      const names = selectedNames[c]!;

      for (let i = 0; i < indices.length; i++) {
        const item = catItems[indices[i]! - 1];
        if (!item) {continue;}
        // Resolve the same way downloadItem does, so a source that sets its own
        // aiFolder does not break the assertion.
        const categoryDir = resolveCategoryDir(tempDir, cat, resolveAiFolder({ source: item.repo }));
        const expectedPath = path.join(categoryDir, names[i]!);
        assert(
          fs.existsSync(expectedPath),
          `expected downloaded file or directory at: ${expectedPath}`
        );
      }
    }
  };

  tests['download into a custom A.I. folder'] = async () => {
    const customFolder = '.copilot-test';
    const firstCategory = ORDERED_CATEGORIES.find(
      cat => filterByCategory(allItems, cat).length > 0
    );
    assert(firstCategory !== undefined, 'at least one category should have items');

    const item = filterByCategory(allItems, firstCategory!)[0]!;
    const meta = await downloadItem(item, tempDir, token, { folderOverride: customFolder });

    const expectedDir = path.join(tempDir, customFolder, firstCategory!);
    assertEqual(
      path.dirname(meta.localPath), expectedDir,
      'folderOverride should place the download under the custom A.I. folder'
    );
    assert(fs.existsSync(meta.localPath), `downloaded item should exist at: ${meta.localPath}`);
    assert(
      !meta.localPath.includes('.github'),
      'folderOverride should bypass the default .github folder'
    );
  };

  let suiteResult: SuiteResult;
  try {
    suiteResult = await runSuite('full: download integration', tests);
  } finally {
    // Always clean up temp dir after the suite, pass or fail
    cleanTempDir(tempDir);
  }

  return suiteResult;
}
