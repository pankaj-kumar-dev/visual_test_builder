/**
 * Multi-select + bulk action unit tests (Phase 8, builder UX roadmap).
 * Same "exercise the reducer directly" shape as nodeActions.test.ts.
 */

import { describe, expect, it } from 'vitest';
import reducer, {
  addNode,
  clearMultiSelect,
  deleteSelectedNodes,
  duplicateSelectedNodes,
  revealNode,
  saveAsReusableFlow,
  selectNode,
  selectRange,
  toggleMultiSelect,
  toggleNodeCollapse,
  undo,
} from './builderSlice';
import type { AppState } from '../domain/types';

function initial(): AppState {
  return reducer(undefined, { type: '@@INIT/multi-select-test' });
}

/** describe > it > [visit, click, type] */
function buildThreeSiblings(): AppState {
  let state = initial();
  state = reducer(state, addNode({ parentId: null, type: 'describe' }));
  const rootId = state.flow!.id;
  state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
  const itId = state.flow!.children![0].id;
  state = reducer(state, addNode({ parentId: itId, type: 'visit' }));
  state = reducer(state, addNode({ parentId: itId, type: 'click' }));
  state = reducer(state, addNode({ parentId: itId, type: 'type' }));
  return state;
}

function childIds(state: AppState): string[] {
  return state.flow!.children![0].children!.map((c) => c.id);
}

describe('toggleMultiSelect', () => {
  it('seeds the set from the existing single selection, then adds the toggled node', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([clickId, visitId].sort());
    expect(state.selectedNodeId).toBe(clickId);
  });

  it('removes a node already in the set when toggled again', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    state = reducer(state, toggleMultiSelect(clickId));
    expect(state.multiSelectedIds).toEqual({ [visitId]: true });
  });

  it('starts a fresh set when nothing was previously selected', () => {
    let state = buildThreeSiblings();
    const [, clickId] = childIds(state);
    state = reducer(state, toggleMultiSelect(clickId));
    expect(state.multiSelectedIds).toEqual({ [clickId]: true });
  });
});

describe('selectRange (Phase 8, shift-click range-select)', () => {
  it('selects every row between the anchor and the target, inclusive', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(visitId)); // anchor = visitId
    state = reducer(state, selectRange(typeId));
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([clickId, typeId, visitId].sort());
    expect(state.selectedNodeId).toBe(typeId);
  });

  it('works in either direction (target before the anchor)', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(typeId)); // anchor = typeId
    state = reducer(state, selectRange(visitId));
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([clickId, typeId, visitId].sort());
  });

  it('a second shift-click re-computes the range from the same fixed anchor', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(visitId)); // anchor = visitId
    state = reducer(state, selectRange(typeId)); // visit..type
    state = reducer(state, selectRange(clickId)); // re-extend from visitId, not typeId
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([clickId, visitId].sort());
  });

  it('a Ctrl/Cmd toggle moves the anchor, so a later shift-click extends from there', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(typeId)); // anchor moves to typeId
    state = reducer(state, selectRange(clickId)); // range: typeId..clickId
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([clickId, typeId].sort());
  });

  it('excludes rows hidden under a collapsed ancestor', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    const it1 = state.flow!.children![0].id;
    state = reducer(state, addNode({ parentId: it1, type: 'visit' }));
    state = reducer(state, addNode({ parentId: it1, type: 'click' }));
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    const it2 = state.flow!.children![1].id;

    state = reducer(state, toggleNodeCollapse(it1));
    state = reducer(state, selectNode(it1));
    state = reducer(state, selectRange(it2));
    // it1's children (visit/click) are hidden while collapsed, so the visual
    // range is just [it1, it2] — not the two hidden rows in between.
    expect(Object.keys(state.multiSelectedIds).sort()).toEqual([it1, it2].sort());
  });

  it('falls back to a plain selection when the anchor no longer resolves', () => {
    let state = buildThreeSiblings();
    const [visitId, , typeId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, deleteSelectedNodes()); // visitId is gone; anchor now stale
    state = reducer(state, selectRange(typeId));
    expect(state.multiSelectedIds).toEqual({});
    expect(state.selectedNodeId).toBe(typeId);
  });

  it('is a no-op on an empty canvas', () => {
    const state = initial();
    expect(reducer(state, selectRange('missing'))).toBe(state);
  });
});

describe('clearMultiSelect / plain selection resets multi-select', () => {
  it('clearMultiSelect empties the set but keeps the primary selection', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    state = reducer(state, clearMultiSelect());
    expect(state.multiSelectedIds).toEqual({});
    expect(state.selectedNodeId).toBe(clickId);
  });

  it('a plain selectNode exits multi-select entirely', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    state = reducer(state, selectNode(typeId));
    expect(state.multiSelectedIds).toEqual({});
    expect(state.selectedNodeId).toBe(typeId);
  });

  it('revealNode also exits multi-select', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    state = reducer(state, revealNode(visitId));
    expect(state.multiSelectedIds).toEqual({});
  });

  it('undo also exits multi-select', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));
    state = reducer(state, undo());
    expect(state.multiSelectedIds).toEqual({});
  });
});

describe('deleteSelectedNodes', () => {
  it('is a no-op when nothing is selected', () => {
    const state = initial();
    expect(reducer(state, deleteSelectedNodes())).toBe(state);
  });

  it('deletes every node in a multi-selection, regardless of order', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(typeId));

    state = reducer(state, deleteSelectedNodes());
    expect(childIds(state)).toEqual([clickId]);
    expect(state.selectedNodeId).toBeNull();
    expect(state.multiSelectedIds).toEqual({});
  });

  it('falls back to the single selectedNodeId when multi-select is empty', () => {
    let state = buildThreeSiblings();
    const [visitId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, deleteSelectedNodes());
    expect(childIds(state)).not.toContain(visitId);
  });
});

describe('duplicateSelectedNodes', () => {
  it('is a no-op when nothing is selected', () => {
    const state = initial();
    expect(reducer(state, duplicateSelectedNodes())).toBe(state);
  });

  it('duplicates every selected node as its own next sibling and selects the copies', () => {
    let state = buildThreeSiblings();
    const [visitId, clickId] = childIds(state);
    state = reducer(state, selectNode(visitId));
    state = reducer(state, toggleMultiSelect(clickId));

    const next = reducer(state, duplicateSelectedNodes());
    expect(childIds(next)).toHaveLength(5);
    expect(Object.keys(next.multiSelectedIds)).toHaveLength(2);
    // Neither clone id collides with an original.
    for (const cloneId of Object.keys(next.multiSelectedIds)) {
      expect(childIds(state)).not.toContain(cloneId);
    }
  });
});

describe('saveAsReusableFlow', () => {
  it('bundles an explicit sibling id set into a new zero-param reusable flow, in document order', () => {
    const state = buildThreeSiblings();
    const [visitId, clickId, typeId] = childIds(state);
    // Payload order: type, visit — saved body must still come out in document order.
    const next = reducer(state, saveAsReusableFlow({ nodeIds: [typeId, visitId], name: 'My Flow' }));

    expect(next.reusableFlows).toHaveLength(state.reusableFlows.length + 1);
    const def = next.reusableFlows[next.reusableFlows.length - 1];
    expect(def.id).toBe('my-flow');
    expect(def.name).toBe('My Flow');
    expect(def.params).toEqual([]);
    expect(def.body.map((n) => n.type)).toEqual(['visit', 'type']);
    expect(def.body.map((n) => n.id)).toEqual([visitId, typeId]);
    void clickId;
  });

  it('saves a single node id with no sibling requirement at all', () => {
    const state = buildThreeSiblings();
    const [, clickId] = childIds(state);
    const next = reducer(state, saveAsReusableFlow({ nodeIds: [clickId], name: 'Just Click' }));
    const saved = next.reusableFlows[next.reusableFlows.length - 1];
    expect(saved.body.map((n) => n.type)).toEqual(['click']);
  });

  it('does not save (no-op) when the ids span different parents', () => {
    const state = buildThreeSiblings();
    const [visitId] = childIds(state);
    const itId = state.flow!.children![0].id;
    // itId and visitId are parent/child, not siblings.
    const next = reducer(state, saveAsReusableFlow({ nodeIds: [itId, visitId], name: 'Bad' }));
    expect(next.reusableFlows).toEqual(state.reusableFlows);
  });

  it('de-duplicates ids against existing reusable flows', () => {
    const state = buildThreeSiblings();
    const [, clickId] = childIds(state);
    let next = reducer(state, saveAsReusableFlow({ nodeIds: [clickId], name: 'Login' })); // collides with bundled "login"
    next = reducer(next, saveAsReusableFlow({ nodeIds: [clickId], name: 'Login' }));
    const ids = next.reusableFlows.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
