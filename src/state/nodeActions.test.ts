/**
 * Node action unit tests (Phase 6, builder UX roadmap): DUPLICATE_NODE and
 * MOVE_NODE_BY. Same "exercise the reducer directly" shape as
 * history.test.ts/collapse.test.ts.
 */

import { describe, expect, it } from 'vitest';
import reducer, { addNode, duplicateNode, moveNodeBy, selectNode } from './builderSlice';
import type { AppState } from '../domain/types';

function initial(): AppState {
  return reducer(undefined, { type: '@@INIT/node-actions-test' });
}

describe('duplicateNode', () => {
  it('is a no-op on an empty canvas', () => {
    const state = initial();
    expect(reducer(state, duplicateNode({ nodeId: 'missing' }))).toBe(state);
  });

  it('is a no-op when duplicating the root (no parent to insert a sibling into)', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    const next = reducer(state, duplicateNode({ nodeId: rootId }));
    expect(next.flow).toEqual(state.flow);
    expect(next.history.past).toEqual(state.history.past);
  });

  it('inserts a deep copy with fresh ids as the next sibling, and selects it', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    const itId = state.flow!.children![0].id;
    state = reducer(
      state,
      addNode({ parentId: itId, type: 'click', index: 0 }),
    );
    const clickId = state.flow!.children![0].children![0].id;

    const next = reducer(state, duplicateNode({ nodeId: itId }));

    expect(next.flow!.children).toHaveLength(2);
    const [original, clone] = next.flow!.children!;
    expect(original.id).toBe(itId);
    expect(clone.id).not.toBe(itId);
    expect(clone.type).toBe('it');
    // The clone's own child got a fresh id too — a full deep copy, not a
    // shallow one sharing the original's descendant ids.
    expect(clone.children).toHaveLength(1);
    expect(clone.children![0].type).toBe('click');
    expect(clone.children![0].id).not.toBe(clickId);
    // Duplicating selects the new copy, not the original.
    expect(next.selectedNodeId).toBe(clone.id);
  });
});

describe('moveNodeBy', () => {
  it('is a no-op on an empty canvas', () => {
    const state = initial();
    expect(reducer(state, moveNodeBy({ nodeId: 'missing', delta: 1 }))).toBe(state);
  });

  it('moves a node up/down among its siblings, clamped at the ends', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    state = reducer(state, addNode({ parentId: rootId, type: 'beforeEach' }));
    state = reducer(state, addNode({ parentId: rootId, type: 'afterEach' }));
    const [itId, beforeEachId, afterEachId] = state.flow!.children!.map((c) => c.id);

    // Move the middle node up: [it, beforeEach, afterEach] -> [beforeEach, it, afterEach]
    let next = reducer(state, moveNodeBy({ nodeId: beforeEachId, delta: -1 }));
    expect(next.flow!.children!.map((c) => c.id)).toEqual([beforeEachId, itId, afterEachId]);

    // Moving the first node up further is a no-op (clamped at index 0).
    const atTop = reducer(next, moveNodeBy({ nodeId: beforeEachId, delta: -1 }));
    expect(atTop.flow).toBe(next.flow);

    // Move the last node down further is a no-op (clamped at the end).
    const atBottom = reducer(next, moveNodeBy({ nodeId: afterEachId, delta: 1 }));
    expect(atBottom.flow).toBe(next.flow);
  });

  it('does not change selection', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    state = reducer(state, addNode({ parentId: rootId, type: 'beforeEach' }));
    const itId = state.flow!.children![0].id;
    state = reducer(state, selectNode(itId));

    const next = reducer(state, moveNodeBy({ nodeId: itId, delta: 1 }));
    expect(next.selectedNodeId).toBe(itId);
  });
});
