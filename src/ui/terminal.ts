import type { CopilotItem, Config, RepositorySource, ToolCategory } from '../types.js';
import { CATEGORY_LABELS } from '../types.js';
import { fetchAllToolsFromSources } from '../engine/github.js';
import { getToken } from '../engine/github.js';
import { downloadItem } from '../engine/download.js';
import { searchTools, filterByCategory, findByCode } from '../engine/search.js';
import {
  ANSI,
  hrLine,
  bold,
  dim,
  renderCompactCategoryList,
  renderExpandedItems,
  renderInstructions,
  renderInputPrompt,
  renderSearchResults,
  renderLoadingIndicator,
  renderDownloadSuccess,
  renderError,
  renderSourceBanner,
  terminalHeight,
} from './renderer.js';
import { readRawKey, readConfirm, restoreTerminal, setupReadline } from './input.js';

type UIMode = 'category' | 'expanded' | 'search';

export interface SourceDisplayInfo {
  type: 'source' | 'url';
  url: string;
  label?: string;
}

interface UIState {
  mode: UIMode;
  items: CopilotItem[];
  filteredItems: CopilotItem[];
  activeCategory: ToolCategory | 'all';
  searchTerm: string;
  scrollOffset: number;
  statusMessage: string;
  inputBuffer: string;
  sources: RepositorySource[];
  sourceDisplay?: SourceDisplayInfo;
}

function write(text: string): void {
  process.stdout.write(text);
}

function writeln(text: string = ''): void {
  process.stdout.write(text + '\n');
}

function clearAndRender(state: UIState): void {
  write(ANSI.clearScreen);
  render(state);
}

function getListAreaHeight(): number {
  // Reserve lines for instructions panel (roughly 6 lines) + input line
  const instructionLines = 7;
  return Math.max(5, terminalHeight() - instructionLines);
}

function render(state: UIState): void {
  const listHeight = getListAreaHeight();

  if (state.sourceDisplay) {
    writeln(renderSourceBanner(state.sourceDisplay.type, state.sourceDisplay.url, state.sourceDisplay.label));
  }

  if (state.mode === 'category') {
    // Compact category list
    writeln(renderCompactCategoryList());
  } else if (state.mode === 'expanded') {
    const { lines } = renderExpandedItems(
      state.filteredItems,
      state.activeCategory,
      state.scrollOffset,
      listHeight
    );
    lines.forEach(line => writeln(line));
  } else if (state.mode === 'search') {
    const liveQuery = state.searchTerm + state.inputBuffer;
    if (liveQuery) {
      const results = searchTools(state.items, liveQuery);
      write(renderSearchResults(results, liveQuery));
      write('\n');
    } else {
      writeln(renderCompactCategoryList());
    }
  }

  // Status message (errors/successes)
  if (state.statusMessage) {
    writeln('');
    writeln(state.statusMessage);
  }

  // Instructions panel
  let instructionMode: 'category' | 'expanded-all' | 'expanded-single' | 'search';
  if (state.mode === 'search') {
    instructionMode = 'search';
  } else if (state.mode === 'expanded' && state.activeCategory === 'all') {
    instructionMode = 'expanded-all';
  } else if (state.mode === 'expanded') {
    instructionMode = 'expanded-single';
  } else {
    instructionMode = 'category';
  }

  writeln('');
  writeln(renderInstructions(instructionMode));

  // Input prompt
  const prompt = renderInputPrompt(state.mode === 'search', state.searchTerm + state.inputBuffer);
  write(prompt + ' ');
}

async function handleDownload(state: UIState, code: string, config: Config): Promise<void> {
  const token = getToken(state.sources[0], config.enterpriseToken);
  const item = findByCode(state.filteredItems, code, state.activeCategory);

  if (!item) {
    state.statusMessage = renderError(`No tool found for code '${code}'`);
    return;
  }

  state.statusMessage = dim(`  Downloading ${item.name}...`);
  clearAndRender(state);

  try {
    const meta = await downloadItem(item, process.cwd(), token);
    state.statusMessage = renderDownloadSuccess(item.name, meta.localPath);
  } catch (err) {
    state.statusMessage = renderError(err instanceof Error ? err.message : String(err));
  }
}

export async function runInteractiveUI(
  config: Config,
  initialCategory: ToolCategory | 'all' | null = null,
  sourceOverride?: { sources: RepositorySource[]; display?: SourceDisplayInfo }
): Promise<void> {
  setupReadline();

  const activeSources = sourceOverride?.sources ?? config.sources;

  const state: UIState = {
    mode: 'category',
    items: [],
    filteredItems: [],
    activeCategory: 'all',
    searchTerm: '',
    scrollOffset: 0,
    statusMessage: '',
    inputBuffer: '',
    sources: activeSources,
    sourceDisplay: sourceOverride?.display,
  };

  // Show loading and fetch tools
  write(ANSI.clearScreen);
  write(ANSI.hideCursor);

  const token = getToken(undefined, config.enterpriseToken);
  const activeSource = activeSources[config.defaultSourceIndex] ?? activeSources[0];
  const repoLabel = activeSource
    ? `${activeSource.owner}/${activeSource.repo}`
    : 'configured sources';

  writeln(renderLoadingIndicator(repoLabel));

  try {
    state.items = await fetchAllToolsFromSources(activeSources, token, config.cacheTimeout);
    state.filteredItems = state.items;
  } catch (err) {
    write(ANSI.showCursor);
    restoreTerminal();
    console.error(renderError(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // If initial category was specified, go directly to expanded view
  if (initialCategory) {
    state.mode = 'expanded';
    state.activeCategory = initialCategory;
    state.filteredItems = initialCategory === 'all'
      ? state.items
      : filterByCategory(state.items, initialCategory);
  }

  clearAndRender(state);

  // Main input loop
  try {
    while (true) {
      const key = await readRawKey();
      state.statusMessage = '';

      if (state.mode === 'search') {
        // Search mode: accumulate characters
        if (key.name === 'escape') {
          state.mode = 'category';
          state.searchTerm = '';
          state.inputBuffer = '';
          state.filteredItems = state.items;
          clearAndRender(state);
        } else if (key.name === 'enter') {
          // Confirm search, switch to expanded mode showing results
          state.filteredItems = searchTools(state.items, state.searchTerm + state.inputBuffer);
          state.searchTerm = state.searchTerm + state.inputBuffer;
          state.inputBuffer = '';
          state.mode = 'expanded';
          state.activeCategory = 'all';
          state.scrollOffset = 0;
          clearAndRender(state);
        } else if (key.name === 'backspace') {
          if (state.inputBuffer.length > 0) {
            state.inputBuffer = state.inputBuffer.slice(0, -1);
          } else if (state.searchTerm.length > 0) {
            state.searchTerm = state.searchTerm.slice(0, -1);
          }
          clearAndRender(state);
        } else if (key.ch && !key.ctrl && !key.meta) {
          state.inputBuffer += key.ch;
          clearAndRender(state);
        }
        continue;
      }

      // Navigation
      if (key.name === 'up') {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
        clearAndRender(state);
        continue;
      }
      if (key.name === 'down') {
        state.scrollOffset++;
        clearAndRender(state);
        continue;
      }
      if (key.name === 'pageup') {
        state.scrollOffset = Math.max(0, state.scrollOffset - getListAreaHeight());
        clearAndRender(state);
        continue;
      }
      if (key.name === 'pagedown') {
        state.scrollOffset += getListAreaHeight();
        clearAndRender(state);
        continue;
      }

      // Quit
      if (key.name === 'q' && state.inputBuffer === '') {
        break;
      }

      // Start search
      if (key.name === '/' && state.inputBuffer === '') {
        state.mode = 'search';
        state.searchTerm = '';
        state.inputBuffer = '';
        clearAndRender(state);
        continue;
      }

      // Back to categories
      if (key.name === 'b' && state.inputBuffer === '') {
        state.mode = 'category';
        state.activeCategory = 'all';
        state.filteredItems = state.items;
        state.scrollOffset = 0;
        state.inputBuffer = '';
        clearAndRender(state);
        continue;
      }

      // Enter key: process inputBuffer
      if (key.name === 'enter') {
        const input = state.inputBuffer.trim().toLowerCase();
        state.inputBuffer = '';

        if (!input) {
          clearAndRender(state);
          continue;
        }

        // Check if it's a category selection
        if (input === 'all') {
          state.mode = 'expanded';
          state.activeCategory = 'all';
          state.filteredItems = state.items;
          state.scrollOffset = 0;
          clearAndRender(state);
          continue;
        }

        const category = CATEGORY_LABELS[input];
        if (category && state.mode !== 'expanded') {
          state.mode = 'expanded';
          state.activeCategory = category;
          state.filteredItems = filterByCategory(state.items, category);
          state.scrollOffset = 0;
          clearAndRender(state);
          continue;
        }

        // Check if it's a download code
        if (state.mode === 'expanded') {
          const isDownloadCode = /^([a-z]+)?(\d+)$/.test(input);
          if (isDownloadCode) {
            await handleDownload(state, input, config);
            clearAndRender(state);
            continue;
          }
        }

        // Unknown input
        state.statusMessage = renderError(`Unknown command '${input}'. Type 'all' or a category label.`);
        clearAndRender(state);
        continue;
      }

      // Backspace: remove from input buffer
      if (key.name === 'backspace') {
        state.inputBuffer = state.inputBuffer.slice(0, -1);
        clearAndRender(state);
        continue;
      }

      // Printable character: add to input buffer
      if (key.ch && !key.ctrl && !key.meta && key.ch !== 'q') {
        state.inputBuffer += key.ch;
        clearAndRender(state);
        continue;
      }

      // Handle 'q' when there's already input in the buffer
      if (key.name === 'q') {
        state.inputBuffer += 'q';
        clearAndRender(state);
        continue;
      }
    }
  } finally {
    write(ANSI.showCursor);
    write(ANSI.clearScreen);
    restoreTerminal();
  }
}

/**
 * Non-interactive output: print tools list to stdout (suitable for piping to less).
 */
export function printToolsList(
  items: CopilotItem[],
  activeCategory: ToolCategory | 'all'
): void {
  const { lines } = renderExpandedItems(items, activeCategory);
  lines.forEach(line => {
    // Strip ANSI codes for pipe-friendly output
    console.log(line.replace(/\x1b\[[0-9;]*m/g, ''));
  });
}
