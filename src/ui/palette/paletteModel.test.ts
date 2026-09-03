/**
 * Palette hierarchy + search unit tests (Scalable Builder UI, Objectives 1 & 2).
 *
 * Two layers, mirroring registry.test.ts:
 *  - the pure model against small fixtures, where ordering, fallbacks and matching
 *    rules can be stated exactly;
 *  - the bundled registry, which is what the shipped palette actually renders.
 */

import { describe, expect, it } from 'vitest';
import {
  breadcrumbOf,
  buildPaletteTree,
  collectPaletteNodes,
  searchPaletteTree,
} from './paletteModel';
import { createRegistry, getRegistry } from '../../registry';
import type {
  CategoryDef,
  CommandNodeDef,
  StructuralNodeDef,
} from '../../domain/types';

function command(
  type: string,
  extra: Partial<CommandNodeDef> = {},
): CommandNodeDef {
  return {
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    category: 'command',
    codeTemplate: `cy.${type}();`,
    ...extra,
  };
}

function block(type: string, extra: Partial<StructuralNodeDef> = {}): StructuralNodeDef {
  return {
    type,
    label: type,
    category: 'structural',
    allowedChildren: [],
    props: [],
    codeTemplate: `${type}();`,
    ...extra,
  };
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'traversal',
    label: 'Traversal',
    subgroups: [
      { id: 'element', label: 'Element' },
      { id: 'position', label: 'Position' },
    ],
  },
  { id: 'action', label: 'Action', subgroups: [{ id: 'input', label: 'Input' }] },
  { id: 'assertion', label: 'Assertion' },
  { id: 'network', label: 'Network' },
];

function fixtureRegistry(
  functions: CommandNodeDef[],
  blocks: StructuralNodeDef[] = [],
  categories: CategoryDef[] = CATEGORIES,
) {
  return createRegistry({ blocks, functions, commandProps: {}, categories });
}

describe('buildPaletteTree — hierarchy', () => {
  it('nests category → subcategory → node', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('get', { group: 'traversal', subgroup: 'element' }),
        command('first', { group: 'traversal', subgroup: 'position' }),
        command('type', { group: 'action', subgroup: 'input' }),
      ]),
    );

    expect(tree.map((c) => c.id)).toEqual(['traversal', 'action']);
    expect(tree[0].subgroups.map((s) => s.label)).toEqual(['Element', 'Position']);
    expect(tree[0].subgroups[0].items.map((n) => n.type)).toEqual(['get']);
    expect(tree[0].total).toBe(2);
  });

  it('lists a node with no subcategory directly under its category (§33 fallback)', () => {
    const tree = buildPaletteTree(fixtureRegistry([command('should', { group: 'assertion' })]));

    expect(tree).toHaveLength(1);
    expect(tree[0].items.map((n) => n.type)).toEqual(['should']);
    expect(tree[0].subgroups).toEqual([]);
  });

  it('mixes direct items and subcategories in the same category', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('legacy', { group: 'action' }),
        command('type', { group: 'action', subgroup: 'input' }),
      ]),
    );

    expect(tree[0].items.map((n) => n.type)).toEqual(['legacy']);
    expect(tree[0].subgroups[0].items.map((n) => n.type)).toEqual(['type']);
    expect(tree[0].total).toBe(2);
  });

  it('omits categories that have no nodes, so the taxonomy can declare future ones', () => {
    const tree = buildPaletteTree(fixtureRegistry([command('get', { group: 'traversal' })]));
    expect(tree.map((c) => c.id)).not.toContain('network');
  });

  it('keeps a node whose group matches no configured category, under a derived label', () => {
    const tree = buildPaletteTree(fixtureRegistry([command('intercept', { group: 'control-flow' })]));

    expect(tree.map((c) => c.id)).toEqual(['control-flow']);
    expect(tree[0].label).toBe('Control Flow');
  });

  it('keeps a node whose subcategory matches no configured one, under a derived label', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([command('drag', { group: 'action', subgroup: 'pointer-gestures' })]),
    );
    expect(tree[0].subgroups.map((s) => s.label)).toEqual(['Pointer Gestures']);
  });

  it('buckets a node with no group at all into "Other" (pre-taxonomy config)', () => {
    const tree = buildPaletteTree(fixtureRegistry([command('mystery')]));

    expect(tree.map((c) => c.id)).toEqual(['other']);
    expect(tree[0].label).toBe('Other');
    expect(tree[0].items.map((n) => n.type)).toEqual(['mystery']);
  });

  it('renders with no taxonomy configured at all', () => {
    const tree = buildPaletteTree(
      createRegistry({
        blocks: [],
        functions: [command('get', { group: 'traversal' })],
        commandProps: {},
      }),
    );
    expect(tree.map((c) => c.label)).toEqual(['Traversal']);
  });
});

describe('buildPaletteTree — ordering', () => {
  it('orders categories by configuration, not alphabetically or by node order', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('should', { group: 'assertion' }),
        command('type', { group: 'action', subgroup: 'input' }),
        command('get', { group: 'traversal', subgroup: 'element' }),
      ]),
    );
    expect(tree.map((c) => c.id)).toEqual(['traversal', 'action', 'assertion']);
  });

  it('orders subcategories by configuration, not by first appearance', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('first', { group: 'traversal', subgroup: 'position' }),
        command('get', { group: 'traversal', subgroup: 'element' }),
      ]),
    );
    expect(tree[0].subgroups.map((s) => s.id)).toEqual(['element', 'position']);
  });

  it('appends unconfigured categories after configured ones, in first-seen order', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('later', { group: 'zeta' }),
        command('get', { group: 'traversal' }),
        command('earlier', { group: 'alpha' }),
      ]),
    );
    expect(tree.map((c) => c.id)).toEqual(['traversal', 'zeta', 'alpha']);
  });

  it('keeps registry order within a subcategory', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([
        command('last', { group: 'traversal', subgroup: 'position' }),
        command('first', { group: 'traversal', subgroup: 'position' }),
      ]),
    );
    expect(tree[0].subgroups[0].items.map((n) => n.type)).toEqual(['last', 'first']);
  });

  it('lists structural blocks before commands', () => {
    const nodes = collectPaletteNodes(
      fixtureRegistry([command('get', { group: 'traversal' })], [block('describe')]),
    );
    expect(nodes.map((n) => n.type)).toEqual(['describe', 'get']);
  });
});

describe('searchPaletteTree — matching', () => {
  const registry = fixtureRegistry([
    command('get', { group: 'traversal', subgroup: 'element', description: 'Select elements by CSS selector.' }),
    command('find', { group: 'traversal', subgroup: 'element', description: 'Search for descendants.' }),
    command('eq', { group: 'traversal', subgroup: 'position', keywords: ['index', 'nth'] }),
    command('select', { group: 'action', subgroup: 'input', label: 'Select', keywords: ['dropdown'] }),
    command('should', { group: 'assertion', label: 'Assert', keywords: ['expect'] }),
  ]);
  const tree = buildPaletteTree(registry);
  const types = (query: string) => searchPaletteTree(tree, query).map((m) => m.node.type);

  it('matches an exact node name', () => {
    expect(types('find')).toEqual(['find']);
  });

  it('matches a partial name', () => {
    expect(types('sel')).toContain('select');
  });

  it('matches case-insensitively', () => {
    expect(types('SELECT')).toEqual(types('select'));
    expect(types('SeLeCt')).toContain('select');
  });

  it('matches a label that differs from the node name', () => {
    expect(types('assert')).toEqual(['should']);
  });

  it('matches description text', () => {
    expect(types('descendants')).toEqual(['find']);
  });

  it('matches keyword synonyms', () => {
    expect(types('dropdown')).toEqual(['select']);
    expect(types('nth')).toEqual(['eq']);
  });

  it('matches a category name, so a whole area can be browsed by typing it', () => {
    expect(types('traversal').sort()).toEqual(['eq', 'find', 'get']);
  });

  it('matches a subcategory name', () => {
    expect(types('position')).toEqual(['eq']);
  });

  it('requires every whitespace-separated token to match', () => {
    expect(types('traversal element')).toEqual(['get', 'find']);
    expect(types('traversal nonsense')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(types('websocket')).toEqual([]);
  });

  it('returns an empty list for an empty or whitespace query', () => {
    expect(types('')).toEqual([]);
    expect(types('   ')).toEqual([]);
  });

  it('ranks name/label matches above description and keyword matches', () => {
    // "select" is in Get's description ("...by CSS selector") and is Select's own
    // label — the labelled one must come first.
    expect(types('select')[0]).toBe('select');
    expect(types('select')).toContain('get');
  });

  it('is deterministic: the same query always yields the same order', () => {
    expect(types('se')).toEqual(types('se'));
  });

  it('keeps each result self-describing with its category breadcrumb (§26)', () => {
    const matches = searchPaletteTree(tree, 'find');
    expect(matches[0].breadcrumb).toBe('Traversal / Element');
  });

  it('uses the bare category as the breadcrumb when there is no subcategory', () => {
    expect(searchPaletteTree(tree, 'assert')[0].breadcrumb).toBe('Assertion');
  });

  it('carries the same node metadata a category listing does, so DnD is unchanged (§32)', () => {
    const listed = tree
      .flatMap((c) => [...c.items, ...c.subgroups.flatMap((s) => s.items)])
      .find((n) => n.type === 'select');
    expect(searchPaletteTree(tree, 'select')[0].node).toEqual(listed);
  });
});

describe('breadcrumbOf', () => {
  it('joins category and subcategory', () => {
    const tree = buildPaletteTree(
      fixtureRegistry([command('get', { group: 'traversal', subgroup: 'element' })]),
    );
    expect(breadcrumbOf(tree[0], tree[0].subgroups[0])).toBe('Traversal / Element');
    expect(breadcrumbOf(tree[0], null)).toBe('Traversal');
  });
});

describe('bundled registry — the palette the app actually renders', () => {
  const tree = buildPaletteTree(getRegistry());

  it('renders the configured taxonomy order, minus the categories with no nodes', () => {
    expect(tree.map((c) => c.label)).toEqual([
      'Structural',
      'Traversal',
      'Action',
      'Assertion',
      'Utility',
      'Network',
      'Browser',
      'Data',
      'Control Flow',
      'Workflow',
      'Custom Command',
    ]);
  });

  it('shows every non-hidden registry node exactly once (Phase 5\'s internal "slot" wrapper is excluded)', () => {
    const registry = getRegistry();
    const listed = tree
      .flatMap((c) => [...c.items, ...c.subgroups.flatMap((s) => s.items)])
      .map((n) => n.type);
    const expected = [
      ...registry.getAllBlocks().filter((b) => !b.hidden).map((b) => b.type),
      ...registry.getAllFunctions().filter((f) => !f.hidden).map((f) => f.type),
    ];
    expect(listed.slice().sort()).toEqual(expected.slice().sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).not.toContain('slot');
  });

  it('groups traversal into Element, Position, Relative and Introspect', () => {
    const traversal = tree.find((c) => c.id === 'traversal')!;
    expect(traversal.subgroups.map((s) => s.label)).toEqual([
      'Element', 'Position', 'Relative', 'Introspect',
    ]);
    expect(traversal.subgroups[1].items.map((n) => n.type)).toEqual(['first', 'last', 'eq']);
  });

  it('finds the assertion node by the word an engineer would actually type', () => {
    expect(searchPaletteTree(tree, 'assert').map((m) => m.node.type)).toContain('should');
    expect(searchPaletteTree(tree, 'expect').map((m) => m.node.type)).toContain('should');
  });

  it('finds structural nodes by concept, not just by label', () => {
    // None of these four carry "hook" in their name or label — they are found via
    // their `keywords`, which is the point of indexing more than the label.
    const hooks = searchPaletteTree(tree, 'hook').map((m) => m.node.type);
    for (const type of ['beforeAll', 'afterAll', 'beforeEach', 'afterEach']) {
      expect(hooks, type).toContain(type);
    }
    expect(searchPaletteTree(tree, 'suite').map((m) => m.node.type)).toContain('describe');
  });

  it('search "select" surfaces the dropdown command first, with its breadcrumb', () => {
    const matches = searchPaletteTree(tree, 'select');
    expect(matches[0].node.type).toBe('select');
    expect(matches[0].breadcrumb).toBe('Action / Input');
  });
});
