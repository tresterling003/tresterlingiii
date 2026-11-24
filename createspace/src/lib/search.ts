import { getCategory } from '@/tools/categories';
import type { CategoryId, ToolDefinition } from '@/tools/types';

/** Lower-case and strip accents so "colour", "Color" and "côlor" behave predictably. */
export const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Score how well one tool matches a query (0 = no match).
 * Every word in the query must appear somewhere (name, keywords, category or description);
 * matches in the name count most, so "color" ranks Color Studio above tools that merely mention it.
 */
export function scoreTool(tool: ToolDefinition, query: string): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  const name = normalize(tool.name);
  const keywords = tool.keywords.map(normalize);
  const category = normalize(`${getCategory(tool.category).name} ${getCategory(tool.category).navLabel}`);
  const description = normalize(tool.description);

  let total = 0;
  for (const word of words) {
    let best = 0;
    if (name.startsWith(word)) best = 100;
    else if (name.split(/[\s&]+/).some((part) => part.startsWith(word))) best = 80;
    else if (name.includes(word)) best = 60;
    if (best < 50 && keywords.some((k) => k.startsWith(word) || k.split(' ').some((p) => p.startsWith(word)))) best = 50;
    if (best < 40 && keywords.some((k) => k.includes(word))) best = 40;
    if (best < 30 && category.split(' ').some((p) => p.startsWith(word))) best = 30;
    if (best < 20 && description.includes(word)) best = 20;
    if (best === 0) return 0; // every word must match
    total += best;
  }
  return total;
}

export interface ToolFilter {
  query?: string;
  category?: CategoryId | null;
}

/** Filter tools by category and search text. Results are ranked when searching, otherwise kept in registry order. */
export function filterTools(tools: ToolDefinition[], { query = '', category = null }: ToolFilter): ToolDefinition[] {
  const inCategory = category ? tools.filter((t) => t.category === category) : tools;
  if (!normalize(query)) return inCategory;
  return inCategory
    .map((tool, index) => ({ tool, index, score: scoreTool(tool, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.tool);
}
