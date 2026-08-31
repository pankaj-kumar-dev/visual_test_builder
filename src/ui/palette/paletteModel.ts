/**
 * Palette model — hierarchy and search (Scalable Builder UI, Objectives 1 & 2).
 *
 * Pure functions over registry metadata. The Palette component renders whatever
 * these return; it contains no taxonomy, no ordering, and no matching rules of its
 * own, so a new category or command is a configuration change (§34).
 *
 * Structure produced:
 *
 *     Category  (config order, from categories.json)
 *       ├── Subgroup   (config order; unknown ids appended in first-seen order)
 *       │     └── Node
 *       └── Node       (nodes with no subgroup list directly under the category)
 *
 * Search collapses that navigation for the duration of the query (§26): it returns
 * a flat, ranked list where every entry still carries its `Category / Subgroup`
 * breadcrumb, so the user never has to open five nested sections to reach a result.
 *
 * No React, no Redux, no search-engine dependency.
 */

import type { CategoryDef, CommandNodeDef, StructuralNodeDef } from '../../domain/types';
import type { Registry } from '../../registry';

/** One draggable entry, flattened from a structural or command definition. */
export interface PaletteNode {
  type: string;
  label: string;
  description?: string;
  keywords?: string[];
  group?: string;
  subgroup?: string;
}

export interface PaletteSubgroup {
  id: string;
  label: string;
  items: PaletteNode[];
}

export interface PaletteCategory {
  id: string;
  label: string;
  description?: string;
  /** Nodes placed in this category with no subgroup — listed directly (§33). */
  items: PaletteNode[];
  subgroups: PaletteSubgroup[];
  /** items + every subgroup's items. */
  total: number;
}

/** A search hit: the node plus where it lives, so results stay self-describing. */
export interface PaletteMatch {
  node: PaletteNode;
  /** e.g. "Traversal / Element", or just "Assertion" when there is no subgroup. */
  breadcrumb: string;
}

/** Category id used for nodes whose `group` matches no configured category. */
const FALLBACK_CATEGORY_ID = 'other';

/** Title-case an unknown id ("control-flow" → "Control Flow") for a usable label. */
function labelFromId(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toPaletteNode(def: StructuralNodeDef | CommandNodeDef): PaletteNode {
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    keywords: def.keywords,
    group: def.group,
    subgroup: def.subgroup,
  };
}

/**
 * All palette-able nodes in registry order: structural definitions first, then
 * commands. Order within a category is this order — configuration decides it.
 */
export function collectPaletteNodes(registry: Registry): PaletteNode[] {
  return [
    ...registry.getAllBlocks().map(toPaletteNode),
    ...registry.getAllFunctions().map(toPaletteNode),
  ];
}

/**
 * Build the category → subgroup → node tree.
 *
 * Ordering rules, in priority order:
 *  1. categories.json array order for configured categories;
 *  2. a category's `subgroups` array order for configured subgroups;
 *  3. first-seen registry order for any category/subgroup id that configuration
 *     does not declare (so unconfigured metadata still renders, deterministically);
 *  4. an "Other" bucket, last, for nodes with no `group` at all.
 *
 * Categories with no nodes are omitted — the taxonomy can declare the full future
 * inventory without the palette showing empty sections (§9).
 */
export function buildPaletteTree(registry: Registry): PaletteCategory[] {
  const configured = registry.getCategories();
  const byId = new Map<string, CategoryDef>(configured.map((c) => [c.id, c]));

  // Category id -> nodes, seeded in configuration order so declared categories
  // keep their order regardless of the order nodes happen to appear in.
  const buckets = new Map<string, PaletteNode[]>(configured.map((c) => [c.id, []]));

  for (const node of collectPaletteNodes(registry)) {
    const id = node.group ?? FALLBACK_CATEGORY_ID;
    const bucket = buckets.get(id);
    if (bucket) bucket.push(node);
    else buckets.set(id, [node]);
  }

  const categories: PaletteCategory[] = [];
  for (const [id, nodes] of buckets) {
    if (nodes.length === 0) continue;
    const def = byId.get(id);
    categories.push({
      id,
      label: def?.label ?? labelFromId(id),
      description: def?.description,
      ...groupBySubgroup(nodes, def),
      total: nodes.length,
    });
  }
  return categories;
}

/** Split a category's nodes into direct items and ordered subgroups. */
function groupBySubgroup(
  nodes: PaletteNode[],
  def: CategoryDef | undefined,
): { items: PaletteNode[]; subgroups: PaletteSubgroup[] } {
  const items: PaletteNode[] = [];
  const declared = def?.subgroups ?? [];
  const buckets = new Map<string, PaletteNode[]>(declared.map((s) => [s.id, []]));

  for (const node of nodes) {
    if (!node.subgroup) {
      items.push(node);
      continue;
    }
    const bucket = buckets.get(node.subgroup);
    if (bucket) bucket.push(node);
    else buckets.set(node.subgroup, [node]);
  }

  const labels = new Map(declared.map((s) => [s.id, s.label]));
  const subgroups: PaletteSubgroup[] = [];
  for (const [id, subgroupItems] of buckets) {
    if (subgroupItems.length === 0) continue;
    subgroups.push({ id, label: labels.get(id) ?? labelFromId(id), items: subgroupItems });
  }
  return { items, subgroups };
}

/** "Traversal / Element", or "Assertion" when the node has no subgroup. */
export function breadcrumbOf(
  category: PaletteCategory,
  subgroup: PaletteSubgroup | null,
): string {
  return subgroup ? `${category.label} / ${subgroup.label}` : category.label;
}

/** Everything a node can be found by: name, label, description, keywords, breadcrumb. */
function haystack(node: PaletteNode, breadcrumb: string): string {
  return [
    node.type,
    node.label,
    node.description ?? '',
    (node.keywords ?? []).join(' '),
    breadcrumb,
  ]
    .join(' ')
    .toLowerCase();
}

/** Lower rank sorts first: label prefix, then label substring, then anything else. */
function rankOf(node: PaletteNode, tokens: string[]): number {
  const label = node.label.toLowerCase();
  const type = node.type.toLowerCase();
  if (tokens.some((t) => label.startsWith(t) || type.startsWith(t))) return 0;
  if (tokens.some((t) => label.includes(t) || type.includes(t))) return 1;
  return 2;
}

/**
 * Filter the tree to the nodes matching `query`.
 *
 * Matching is deliberately simple and deterministic: the query is split on
 * whitespace and every token must appear (case-insensitively, as a substring) in
 * the node's searchable text — name, label, description, keywords, or its
 * `Category / Subgroup` breadcrumb. No fuzzy matching, no scoring library.
 *
 * Results are ranked (label-prefix, then label-substring, then description /
 * keyword / category hits) and are stable within a rank: ties keep configuration
 * order, so the same query always produces the same list.
 *
 * An empty or whitespace-only query returns an empty array; callers render the
 * full hierarchy in that case rather than a result list.
 */
export function searchPaletteTree(
  categories: PaletteCategory[],
  query: string,
): PaletteMatch[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const matches: { match: PaletteMatch; rank: number }[] = [];
  for (const category of categories) {
    const scan = (nodes: PaletteNode[], subgroup: PaletteSubgroup | null) => {
      const breadcrumb = breadcrumbOf(category, subgroup);
      for (const node of nodes) {
        const text = haystack(node, breadcrumb);
        if (tokens.every((token) => text.includes(token))) {
          matches.push({ match: { node, breadcrumb }, rank: rankOf(node, tokens) });
        }
      }
    };
    scan(category.items, null);
    for (const subgroup of category.subgroups) scan(subgroup.items, subgroup);
  }

  // Stable sort by rank only — Array.prototype.sort is stable in ES2019+, so equal
  // ranks keep the traversal (configuration) order established above.
  return matches.sort((a, b) => a.rank - b.rank).map((entry) => entry.match);
}
