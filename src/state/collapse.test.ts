/**
 * Tree-collapse UI state tests (Scalable Builder UI, Objective 3).
 *
 * Collapse lives in Redux keyed by node id and must never touch the Flow JSON, so
 * these exercise the reducer directly: what collapses, what survives a reorder,
 * what is cleaned up on delete, and — the load-bearing property — that none of it
 * can change `flow` or `generatedCode`.
 */

import { describe, expect, it } from 'vitest';
import reducer, {
  addNode,
  deleteNode,
  reorderNode,
  revealNode,
  selectNode,
  toggleNodeCollapse,
  updateProp,
} from './builderSlice';
import { collectSubtreeIds, findAncestorIds } from './flowTree';
import type { AppState, FlowNode } from '../domain/types';
import { processFlow } from '../engine/processFlow';

/** describe > it > chain > [get, click], plus a second it. */
function flow(): FlowNode {
  return {
    id: 'describe-1',
    type: 'describe',
    props: { label: 'Suite' },
    children: [
      {
        id: 'it-1',
        type: 'it',
        props: { label: 'first test' },
        children: [
          {
            id: 'chain-1',
            type: 'chain',
            props: {},
            children: [
              { id: 'get-1', type: 'get', props: { selector: '.row' } },
              { id: 'click-1', type: 'click', props: {} },
            ],
          },
        ],
      },
      { id: 'it-2', type: 'it', props: { label: 'second test' }, children: [] },
    ],
  };
}

function stateWith(overrides: Partial<AppState> = {}): AppState {
  const tree = overrides.flow === undefined ? flow() : overrides.flow;
  return {
    flow: tree,
    selectedNodeId: null,
    generatedCode: processFlow(tree),
    isCodeDrawerOpen: false,
    isValidationPanelOpen: false,
    collapsedNodeIds: {},
    reusableFlows: [],
    history: { past: [], future: [] },
    ...overrides,
  };
}

describe('flowTree — ancestor and subtree helpers', () => {
  const tree = flow();

  it('lists the ancestors of a deeply nested node, root first', () => {
    expect(findAncestorIds(tree, 'click-1')).toEqual(['describe-1', 'it-1', 'chain-1']);
  });

  it('gives the root itself no ancestors', () => {
    expect(findAncestorIds(tree, 'describe-1')).toEqual([]);
  });

  it('returns null for a node that is not in the tree', () => {
    expect(findAncestorIds(tree, 'nope')).toBeNull();
  });

  it('collects a node and every descendant', () => {
    expect(collectSubtreeIds(tree.children![0])).toEqual([
      'it-1', 'chain-1', 'get-1', 'click-1',
    ]);
  });
});

describe('toggleNodeCollapse', () => {
  it('collapses, then expands, the same node', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-1'));
    expect(state.collapsedNodeIds).toEqual({ 'it-1': true });

    state = reducer(state, toggleNodeCollapse('it-1'));
    expect(state.collapsedNodeIds).toEqual({});
  });

  it('collapses nested nodes independently', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-1'));
    state = reducer(state, toggleNodeCollapse('chain-1'));
    expect(state.collapsedNodeIds).toEqual({ 'it-1': true, 'chain-1': true });

    // Expanding the outer node leaves the inner one collapsed — collapse state is
    // per node, not inherited.
    state = reducer(state, toggleNodeCollapse('it-1'));
    expect(state.collapsedNodeIds).toEqual({ 'chain-1': true });
  });

  it('never touches the Flow JSON or the generated code', () => {
    const before = stateWith();
    const after = reducer(before, toggleNodeCollapse('it-1'));

    expect(after.flow).toBe(before.flow);
    expect(after.generatedCode).toBe(before.generatedCode);
    expect(JSON.stringify(after.flow)).not.toContain('collapsed');
  });

  it('leaves the generated code byte-identical for a fully collapsed tree', () => {
    const before = stateWith();
    let state = before;
    for (const id of collectSubtreeIds(before.flow!)) {
      state = reducer(state, toggleNodeCollapse(id));
    }
    expect(state.generatedCode).toBe(before.generatedCode);
    expect(processFlow(state.flow)).toBe(before.generatedCode);
  });

  it('still allows selecting a collapsed node', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-1'));
    state = reducer(state, selectNode('it-1'));
    expect(state.selectedNodeId).toBe('it-1');
    expect(state.collapsedNodeIds['it-1']).toBe(true);
  });
});

describe('collapse state through structural edits', () => {
  it('follows the node, not the position, when siblings are reordered', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-1'));
    state = reducer(state, reorderNode({ nodeId: 'it-1', toIndex: 1 }));

    expect(state.flow!.children!.map((c) => c.id)).toEqual(['it-2', 'it-1']);
    // it-1 moved into the slot it-2 used to occupy; the flag moved with it-1.
    expect(state.collapsedNodeIds).toEqual({ 'it-1': true });
  });

  it('survives an unrelated property edit', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('chain-1'));
    state = reducer(state, updateProp({ nodeId: 'it-2', key: 'label', value: 'renamed' }));
    expect(state.collapsedNodeIds).toEqual({ 'chain-1': true });
  });

  it('drops the state of a deleted node and of everything under it', () => {
    let state = stateWith();
    for (const id of ['it-1', 'chain-1', 'it-2']) {
      state = reducer(state, toggleNodeCollapse(id));
    }
    state = reducer(state, deleteNode({ nodeId: 'it-1' }));

    // it-1 and its descendant chain-1 are gone; the untouched sibling remains.
    expect(state.collapsedNodeIds).toEqual({ 'it-2': true });
  });

  it('deletes a collapsed subtree correctly, code included', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-1'));
    state = reducer(state, deleteNode({ nodeId: 'it-1' }));

    expect(state.flow!.children!.map((c) => c.id)).toEqual(['it-2']);
    expect(state.generatedCode).toBe(processFlow(state.flow));
    expect(state.generatedCode).not.toContain('first test');
  });

  it('expands a collapsed parent when a node is dropped into it', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('it-2'));
    state = reducer(state, addNode({ parentId: 'it-2', type: 'click' }));

    expect(state.collapsedNodeIds['it-2']).toBeUndefined();
    expect(state.flow!.children![1].children).toHaveLength(1);
  });
});

describe('revealNode — collapse + unresolved-warning integration (§31)', () => {
  it('selects the node and expands every collapsed ancestor', () => {
    let state = stateWith();
    for (const id of ['it-1', 'chain-1']) {
      state = reducer(state, toggleNodeCollapse(id));
    }

    state = reducer(state, revealNode('click-1'));

    expect(state.selectedNodeId).toBe('click-1');
    expect(state.collapsedNodeIds).toEqual({});
  });

  it('leaves unrelated collapsed nodes alone', () => {
    let state = stateWith();
    for (const id of ['it-1', 'it-2']) {
      state = reducer(state, toggleNodeCollapse(id));
    }

    state = reducer(state, revealNode('chain-1'));

    expect(state.collapsedNodeIds).toEqual({ 'it-2': true });
  });

  it('does not expand the revealed node itself — only what was hiding it', () => {
    let state = reducer(stateWith(), toggleNodeCollapse('chain-1'));
    state = reducer(state, revealNode('chain-1'));

    expect(state.selectedNodeId).toBe('chain-1');
    expect(state.collapsedNodeIds).toEqual({ 'chain-1': true });
  });

  it('still selects a node that is not in the tree, changing nothing else', () => {
    const before = reducer(stateWith(), toggleNodeCollapse('it-1'));
    const after = reducer(before, revealNode('ghost'));

    expect(after.selectedNodeId).toBe('ghost');
    expect(after.collapsedNodeIds).toEqual({ 'it-1': true });
  });

  it('does not touch the Flow JSON or the generated code', () => {
    const before = reducer(stateWith(), toggleNodeCollapse('it-1'));
    const after = reducer(before, revealNode('click-1'));

    expect(after.flow).toBe(before.flow);
    expect(after.generatedCode).toBe(before.generatedCode);
  });
});
