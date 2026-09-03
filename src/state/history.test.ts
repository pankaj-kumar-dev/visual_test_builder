/**
 * Undo/redo unit tests (Phase 5, state/builderSlice.ts).
 *
 * History hangs off the single existing `applyFlow` choke point — no second
 * state-management mechanism — so these exercise the reducer directly, the
 * same shape as collapse.test.ts/largeFlow.test.ts. `past`/`future` are
 * exercised as an implementation detail (their lengths/contents) precisely
 * because undo/redo correctness *is* "these two stacks behave correctly".
 */

import { describe, expect, it } from 'vitest';
import reducer, {
  addNode,
  deleteNode,
  loadFlow,
  redo,
  reorderNode,
  selectNode,
  undo,
  updateProp,
} from './builderSlice';
import type { AppState } from '../domain/types';

/** The slice's real initial state, via the standard "unknown action" bootstrap. */
function initial(): AppState {
  return reducer(undefined, { type: '@@INIT/history-test' });
}

describe('undo/redo — initial state', () => {
  it('undo on a fresh canvas is a no-op — Immer returns the identical state reference', () => {
    const state = initial();
    expect(reducer(state, undo())).toBe(state);
  });

  it('redo on a fresh canvas is a no-op — identical state reference', () => {
    const state = initial();
    expect(reducer(state, redo())).toBe(state);
  });

  it('starts with empty past/future stacks', () => {
    const state = initial();
    expect(state.history).toEqual({ past: [], future: [] });
  });
});

describe('undo/redo — the required add -> edit -> delete -> undo x3 -> redo x2 -> new edit -> redo unavailable sequence', () => {
  it('walks the whole sequence with the exact expected flow/history at every step', () => {
    let state = initial();

    // add: null -> { describe, label: '' }
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    expect(state.flow).toEqual({ id: rootId, type: 'describe', props: {} });
    expect(state.history.past).toEqual([null]);
    expect(state.history.future).toEqual([]);

    // edit: label '' -> 'Suite'
    state = reducer(state, updateProp({ nodeId: rootId, key: 'label', value: 'Suite' }));
    expect(state.flow).toEqual({ id: rootId, type: 'describe', props: { label: 'Suite' } });
    expect(state.history.past).toEqual([null, { id: rootId, type: 'describe', props: {} }]);
    expect(state.history.future).toEqual([]);

    const afterEdit = state.flow;

    // delete: root removed -> null
    state = reducer(state, deleteNode({ nodeId: rootId }));
    expect(state.flow).toBeNull();
    expect(state.history.past).toEqual([null, { id: rootId, type: 'describe', props: {} }, afterEdit]);
    expect(state.history.future).toEqual([]);

    // undo #1: back to post-edit ('Suite')
    state = reducer(state, undo());
    expect(state.flow).toEqual(afterEdit);
    expect(state.history.past).toEqual([null, { id: rootId, type: 'describe', props: {} }]);
    expect(state.history.future).toEqual([null]);

    // undo #2: back to post-add (no label)
    state = reducer(state, undo());
    expect(state.flow).toEqual({ id: rootId, type: 'describe', props: {} });
    expect(state.history.past).toEqual([null]);
    expect(state.history.future).toEqual([null, afterEdit]);

    // undo #3: back to the empty canvas
    state = reducer(state, undo());
    expect(state.flow).toBeNull();
    expect(state.history.past).toEqual([]);
    expect(state.history.future).toEqual([null, afterEdit, { id: rootId, type: 'describe', props: {} }]);

    // redo #1: forward to post-add
    state = reducer(state, redo());
    expect(state.flow).toEqual({ id: rootId, type: 'describe', props: {} });
    expect(state.history.past).toEqual([null]);
    expect(state.history.future).toEqual([null, afterEdit]);

    // redo #2: forward to post-edit ('Suite')
    state = reducer(state, redo());
    expect(state.flow).toEqual(afterEdit);
    expect(state.history.past).toEqual([null, { id: rootId, type: 'describe', props: {} }]);
    expect(state.history.future).toEqual([null]);

    // new edit: a fresh mutation after undo clears the redo/future stack entirely,
    // even though something was still sitting in `future`.
    state = reducer(state, updateProp({ nodeId: rootId, key: 'label', value: 'Renamed' }));
    expect(state.flow).toEqual({ id: rootId, type: 'describe', props: { label: 'Renamed' } });
    expect(state.history.future).toEqual([]);

    // redo is now unavailable — a no-op, identical state reference.
    const beforeRedo = state;
    state = reducer(state, redo());
    expect(state).toBe(beforeRedo);
  });
});

describe('undo/redo — no pollution from undo/redo themselves', () => {
  it('undo does not push a new past entry, only moves one to future', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    state = reducer(state, updateProp({ nodeId: state.flow!.id, key: 'label', value: 'x' }));
    expect(state.history.past).toHaveLength(2);

    state = reducer(state, undo());
    expect(state.history.past).toHaveLength(1);
    expect(state.history.future).toHaveLength(1);

    state = reducer(state, undo());
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(2);
  });

  it('redo does not push a new future entry, only moves one to past', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    state = reducer(state, undo());
    expect(state.history.future).toHaveLength(1);

    state = reducer(state, redo());
    expect(state.history.future).toHaveLength(0);
    expect(state.history.past).toHaveLength(1);
  });
});

describe('undo/redo — no-op mutations never create a pointless history entry', () => {
  it('deleting an id that is not in the tree records nothing', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const past = state.history.past;

    state = reducer(state, deleteNode({ nodeId: 'ghost' }));
    expect(state.history.past).toBe(past); // same array reference — nothing pushed
  });

  it('reordering a node to its own current index records nothing', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    const beforeReorder = state.history.past.length;

    const firstChildId = state.flow!.children![0].id;
    state = reducer(state, reorderNode({ nodeId: firstChildId, toIndex: 0 }));
    expect(state.history.past).toHaveLength(beforeReorder);
  });
});

describe('undo/redo — selection', () => {
  it('clears the selected node if undo restores a tree where it no longer exists', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    const rootId = state.flow!.id;
    state = reducer(state, addNode({ parentId: rootId, type: 'it' }));
    const childId = state.flow!.children![0].id;
    state = reducer(state, selectNode(childId));
    state = reducer(state, deleteNode({ nodeId: childId }));

    state = reducer(state, undo()); // restores the child
    expect(state.selectedNodeId).toBeNull(); // undo itself never re-selects anything
  });
});

describe('loadFlow — resets history rather than recording the discarded flow', () => {
  it('a fresh import starts with empty past/future, and undo cannot reach the pre-import flow', () => {
    let state = initial();
    state = reducer(state, addNode({ parentId: null, type: 'describe' }));
    expect(state.history.past).toHaveLength(1);

    state = reducer(state, loadFlow({ id: 'imported', type: 'describe', props: { label: 'Imported' } }));
    expect(state.history).toEqual({ past: [], future: [] });

    const beforeUndo = state;
    state = reducer(state, undo());
    expect(state).toBe(beforeUndo); // no-op — there is nothing to undo back to
  });
});
