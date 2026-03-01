import type { CopilotItem, ToolCategory } from '../types.js';
import { CATEGORY_DISPLAY, ORDERED_CATEGORIES } from '../types.js';
import { filterByCategory } from '../engine/search.js';

// ANSI escape codes
const ESC = '\x1b';
export const ANSI = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  clearScreen: `${ESC}[2J${ESC}[H`,
  clearLine: `${ESC}[2K`,
  moveCursorUp: (n: number) => `${ESC}[${n}A`,
  moveCursorDown: (n: number) => `${ESC}[${n}B`,
  saveCursor: `${ESC}7`,
  restoreCursor: `${ESC}8`,
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  cursorTo: (row: number, col: number) => `${ESC}[${row};${col}H`,
};

export function terminalWidth(): number {
  return process.stdout.columns || 80;
}

export function terminalHeight(): number {
  return process.stdout.rows || 24;
}

export function hrLine(): string {
  return '-'.repeat(terminalWidth());
}

export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`;
}

export function renderCategoryHeader(category: ToolCategory, count?: number): string {
  const { label, title } = CATEGORY_DISPLAY[category];
  const countStr = count !== undefined ? ` (${count})` : '';
  return `[${label}] ${title}:${countStr}`;
}

export function renderCompactCategoryList(): string {
  const lines: string[] = [];
  lines.push(bold('[all]') + ' SHOW ALL');
  for (const cat of ORDERED_CATEGORIES) {
    const { label, title } = CATEGORY_DISPLAY[cat];
    lines.push(`[${label}] ${title}:`);
  }
  return lines.join('\n');
}

export function renderExpandedItems(
  items: CopilotItem[],
  activeCategory: ToolCategory | 'all',
  scrollOffset = 0,
  maxRows?: number
): { lines: string[]; totalLines: number } {
  const allLines: string[] = [];

  if (activeCategory === 'all') {
    for (const cat of ORDERED_CATEGORIES) {
      const catItems = filterByCategory(items, cat);
      if (catItems.length === 0) {continue;}
      const { label, title } = CATEGORY_DISPLAY[cat];
      allLines.push('');
      allLines.push(bold(`[${label}] ${title}:`));
      catItems.forEach((item, idx) => {
        allLines.push(`      ${String(idx + 1).padStart(2, ' ')}  ${item.name}`);
      });
    }
  } else {
    const catItems = filterByCategory(items, activeCategory);
    const { label, title } = CATEGORY_DISPLAY[activeCategory];
    allLines.push('');
    allLines.push(bold(`[${label}] ${title}:`));
    catItems.forEach((item, idx) => {
      allLines.push(`      ${String(idx + 1).padStart(2, ' ')}  ${item.name}`);
    });
  }

  const totalLines = allLines.length;

  if (maxRows !== undefined) {
    const visible = allLines.slice(scrollOffset, scrollOffset + maxRows);
    return { lines: visible, totalLines };
  }

  return { lines: allLines, totalLines };
}

export function renderInstructions(mode: 'category' | 'expanded-all' | 'expanded-single' | 'search'): string {
  const hr = hrLine();
  const lines = [hr, bold('*** INSTRUCTIONS ***')];

  if (mode === 'category') {
    lines.push('Navigate with arrow keys or PgUp/PgDown.');
    lines.push('');
    lines.push('q = Quit;  / = Start Search');
    lines.push('[a], [i], [p], [pl], [s], [w] or [all] = Expand category');
  } else if (mode === 'expanded-all') {
    lines.push('Navigate with arrow keys or PgUp/PgDown.');
    lines.push('');
    lines.push('q = Quit;  / = Search;  b = Back to categories');
    lines.push('([a],[i],[p],[pl],[s],[w])[0-9]+ = Download  (e.g. a1 for first agent)');
  } else if (mode === 'expanded-single') {
    lines.push('Navigate with arrow keys or PgUp/PgDown.');
    lines.push('');
    lines.push('q = Quit;  / = Search;  b = Back to categories');
    lines.push('[0-9]+ = Download by number  (e.g. 1 for first item)');
  } else if (mode === 'search') {
    lines.push('Type to search. Press Enter to confirm, Esc to cancel.');
    lines.push('');
    lines.push('Format: term  |  a:term (agents only)  |  pl:term (plugins only)');
    lines.push('q = Quit after Esc;  b = Back to categories');
  }

  lines.push(hr);
  return lines.join('\n');
}

export function renderInputPrompt(searchMode: boolean, searchTerm = ''): string {
  if (searchMode) {
    return `/ ${searchTerm}`;
  }
  return searchTerm ? `> ${searchTerm}` : '>';
}

export function renderSearchResults(
  items: CopilotItem[],
  query: string
): string {
  const lines: string[] = [];

  for (const cat of ORDERED_CATEGORIES) {
    const catItems = filterByCategory(items, cat);
    if (catItems.length === 0) {continue;}
    const { label, title } = CATEGORY_DISPLAY[cat];
    lines.push('');
    lines.push(bold(`[${label}] ${title}:`));
    catItems.forEach((item, idx) => {
      lines.push(`      ${String(idx + 1).padStart(2, ' ')}  ${item.name}`);
    });
  }

  if (lines.length === 0) {
    lines.push(`  (no results for '${query}')`);
  }

  return lines.join('\n');
}

export function renderLoadingIndicator(repo: string): string {
  return dim(`  Fetching tools from ${repo}...`);
}

export function renderDownloadSuccess(name: string, localPath: string): string {
  return `  Downloaded: ${bold(name)} → ${localPath}`;
}

export function renderError(message: string): string {
  return `  Error: ${message}`;
}
