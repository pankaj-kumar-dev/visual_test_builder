/**
 * Realistic large-flow tests (Scalable Builder UI, §38 & §45).
 *
 * The brief's reference shape — a suite with hooks and several chained test cases —
 * built at three sizes, so the new UI state (collapse) and the shared derivations
 * (code generation, unresolved detection, palette search) are exercised against
 * enterprise-scale trees rather than three-node examples.
 *
 * This is not a benchmarking harness: the timings assert only that the operations
 * are cheap enough not to be doing per-keystroke full-tree work. The structural
 * assertions are the point.
 */

import { describe, expect, it } from 'vitest';
import reducer, { revealNode, toggleNodeCollapse } from './builderSlice';
import { collectSubtreeIds, findAncestorIds } from './flowTree';
import { processFlow } from '../engine/processFlow';
import { findUnresolvedNodes } from '../engine/unresolved';
import { buildPaletteTree, searchPaletteTree } from '../ui/palette/paletteModel';
import { getRegistry } from '../registry';
import type { AppState, FlowNode } from '../domain/types';

const CASES = ['Create', 'Search', 'Edit', 'Delete'];

/**
 * describe
 *  ├── beforeEach > chain(get, click)
 *  ├── it: <case> > chain(get, find, first, click, should)  × `perCase` chains
 *  └── afterEach  > chain(get, click)
 */
function buildFlow(chainsPerCase: number): FlowNode {
  let seq = 0;
  const id = (type: string) => `${type}-${(seq += 1)}`;
  const cmd = (type: string, props: Record<string, string>): FlowNode => ({
    id: id(type),
    type,
    props,
  });

  const chain = (index: number): FlowNode => ({
    id: id('chain'),
    type: 'chain',
    props: {},
    children: [
      cmd('get', { selector: `[data-testid=row-${index}]` }),
      cmd('find', { target: '.cell' }),
      cmd('first', {}),
      cmd('click', {}),
      cmd('should', { assertion: 'be.visible' }),
    ],
  });

  const hook = (type: string): FlowNode => ({
    id: id(type),
    type,
    props: {},
    children: [
      {
        id: id('chain'),
        type: 'chain',
        props: {},
        children: [cmd('get', { selector: '#app' }), cmd('click', {})],
      },
    ],
  });

  return {
    id: 'describe-root',
    type: 'describe',
    props: { label: 'User Management' },
    children: [
      hook('beforeEach'),
      ...CASES.map((name, caseIndex) => ({
        id: id('it'),
        type: 'it',
        props: { label: name },
        children: Array.from({ length: chainsPerCase }, (_, i) =>
          chain(caseIndex * chainsPerCase + i),
        ),
      })),
      hook('afterEach'),
    ],
  };
}

function stateFor(tree: FlowNode): AppState {
  return {
    flow: tree,
    selectedNodeId: null,
    generatedCode: processFlow(tree),
    isCodeDrawerOpen: false,
    isValidationPanelOpen: false,
    collapsedNodeIds: {},
    reusableFlows: [],
    history: { past: [], future: [] },
  };
}

// The three scales named in §45: ~50+, ~100+, ~200+ nodes.
const SIZES = [2, 4, 8].map((chainsPerCase) => {
  const tree = buildFlow(chainsPerCase);
  return { chainsPerCase, tree, size: collectSubtreeIds(tree).length };
});

describe('realistic flow — the §38 reference shape', () => {
  const { tree } = SIZES[0];

  it('has the expected structure: hooks around four chained test cases', () => {
    expect(tree.children!.map((c) => c.type)).toEqual([
      'beforeEach', 'it', 'it', 'it', 'it', 'afterEach',
    ]);
    expect(tree.children!.slice(1, 5).map((c) => c.props!.label)).toEqual(CASES);
  });

  it('compiles to a complete, placeholder-free Cypress suite', () => {
    const code = processFlow(tree);
    expect(code).toContain("describe('User Management', () => {");
    expect(code).toContain('beforeEach(() => {');
    expect(code).toContain('afterEach(() => {');
    for (const name of CASES) expect(code).toContain(`it('${name}', () => {`);
    expect(code).not.toContain('{{');
    expect(code).not.toContain('[Invalid chain]');
  });

  it('reports nothing unresolved — chain-context fields are not false alarms', () => {
    // Every chained `find`/`first`/`click`/`should` here has no `selector` value at
    // all. Before context-aware resolution each would have been a warning the user
    // could not act on; now the flow is genuinely clean.
    expect(findUnresolvedNodes(tree)).toEqual([]);
  });
});

describe('the three scales from §45', () => {
  it('covers 50+, 100+ and 200+ node flows', () => {
    expect(SIZES.map((s) => s.size)).toEqual([61, 109, 205]);
  });
});

describe.each(SIZES)('at $size nodes ($chainsPerCase chains per case)', ({ tree, size }) => {
  it('collapsing every node leaves the generated code identical', () => {
    const before = stateFor(tree);
    let state = before;
    for (const id of collectSubtreeIds(tree)) {
      state = reducer(state, toggleNodeCollapse(id));
    }

    expect(Object.keys(state.collapsedNodeIds)).toHaveLength(size);
    expect(state.generatedCode).toBe(before.generatedCode);
    expect(state.flow).toBe(before.flow);
  });

  it('collapse toggles stay cheap — no full-tree work per toggle', () => {
    let state = stateFor(tree);
    const ids = collectSubtreeIds(tree);

    const started = performance.now();
    for (const id of ids) state = reducer(state, toggleNodeCollapse(id));
    const elapsed = performance.now() - started;

    // Generous by design: this catches an accidental O(nodes) walk (or a code
    // re-derivation) per toggle, not small machine-to-machine variance.
    expect(elapsed).toBeLessThan(500);
  });

  it('reveals the deepest node from the drawer by expanding only its ancestors', () => {
    const ids = collectSubtreeIds(tree);
    const deepest = ids[ids.length - 1];
    let state = stateFor(tree);
    for (const id of ids) {
      state = reducer(state, toggleNodeCollapse(id));
    }

    state = reducer(state, revealNode(deepest));

    const ancestors = findAncestorIds(tree, deepest)!;
    for (const id of ancestors) {
      expect(state.collapsedNodeIds[id], id).toBeUndefined();
    }
    expect(state.selectedNodeId).toBe(deepest);
    // Everything that wasn't hiding it stays collapsed.
    expect(Object.keys(state.collapsedNodeIds)).toHaveLength(size - ancestors.length);
  });

  it('unresolved detection stays a single pass over the tree', () => {
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) findUnresolvedNodes(tree);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('palette search stays usable against a large registry', () => {
  it('answers many queries against a synthetic 300-node registry quickly', () => {
    const registry = getRegistry();
    const tree = buildPaletteTree(registry);

    const started = performance.now();
    for (let i = 0; i < 300; i += 1) {
      searchPaletteTree(tree, 'select');
      searchPaletteTree(tree, 'traversal element');
      searchPaletteTree(tree, 'zzz');
    }
    // 900 queries; a per-keystroke search must be far below this.
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
