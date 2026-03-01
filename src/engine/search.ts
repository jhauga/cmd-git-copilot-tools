import type { CopilotItem, ToolCategory } from '../types.js';
import { CATEGORY_LABELS } from '../types.js';

/**
 * Search tools by query string.
 * Query formats:
 *   - "term"       → search all categories
 *   - "a:term"     → search only agents
 *   - "pl:term"    → search only plugins
 * Multiple terms separated by commas.
 */
export function searchTools(items: CopilotItem[], query: string): CopilotItem[] {
  const terms = query.split(',').map(t => t.trim()).filter(Boolean);
  if (terms.length === 0) {return items;}

  const results = new Set<CopilotItem>();

  for (const term of terms) {
    const colonIdx = term.indexOf(':');
    if (colonIdx > 0) {
      const prefix = term.slice(0, colonIdx).toLowerCase();
      const search = term.slice(colonIdx + 1).toLowerCase();
      const category = CATEGORY_LABELS[prefix];
      if (category && search) {
        for (const item of items) {
          if (item.category === category && itemMatches(item, search)) {
            results.add(item);
          }
        }
      } else if (search) {
        // Unrecognized prefix, search all
        for (const item of items) {
          if (itemMatches(item, term.toLowerCase())) {
            results.add(item);
          }
        }
      }
    } else {
      const search = term.toLowerCase();
      for (const item of items) {
        if (itemMatches(item, search)) {
          results.add(item);
        }
      }
    }
  }

  return Array.from(results);
}

function itemMatches(item: CopilotItem, search: string): boolean {
  return (
    item.name.toLowerCase().includes(search) ||
    item.file.path.toLowerCase().includes(search)
  );
}

export function filterByCategory(items: CopilotItem[], category: ToolCategory): CopilotItem[] {
  return items.filter(item => item.category === category);
}

export function groupByCategory(items: CopilotItem[]): Map<ToolCategory, CopilotItem[]> {
  const map = new Map<ToolCategory, CopilotItem[]>();
  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) {
      existing.push(item);
    } else {
      map.set(item.category, [item]);
    }
  }
  return map;
}

/**
 * Find an item by its download code.
 * In "all" view: "a1" → first agent, "pl2" → second plugin
 * In single-category view: "1" → first item
 */
export function findByCode(
  items: CopilotItem[],
  code: string,
  activeCategory: ToolCategory | 'all'
): CopilotItem | undefined {
  code = code.trim().toLowerCase();

  if (activeCategory !== 'all') {
    // Single-category: code is just a number
    const idx = parseInt(code, 10);
    if (isNaN(idx) || idx < 1) {return undefined;}
    const catItems = filterByCategory(items, activeCategory);
    return catItems[idx - 1];
  }

  // All view: code is label+number (e.g. "a1", "pl2")
  for (const [label, category] of Object.entries(CATEGORY_LABELS)) {
    if (code.startsWith(label)) {
      const numStr = code.slice(label.length);
      const idx = parseInt(numStr, 10);
      if (!isNaN(idx) && idx >= 1) {
        const catItems = filterByCategory(items, category);
        return catItems[idx - 1];
      }
    }
  }

  return undefined;
}
