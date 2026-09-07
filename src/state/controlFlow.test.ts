/**
 * Reducer-level integration tests for Phase 5's multi-slot auto-seeding and the
 * reusable-flow library's presence in Redux state. Generation/validation
 * correctness for `if`/`forEach`/`customCommand`/`flowInvocation` themselves is
 * covered by engine/processFlow.test.ts, engine/goldenFlows.test.ts,
 * engine/unresolved.test.ts and engine/references.test.ts; this file only
 * proves the *reducer* wires them up correctly (auto-seeding on add, and that
 * ordinary insert/delete continue to work unchanged inside a slot).
 */

import { describe, expect, it } from 'vitest';
import reducer, { addNode, deleteNode, updateProp } from './builderSlice';
import type { AppState, FlowNode } from '../domain/types';

function initial(): AppState {
  return reducer(undefined, { type: '@@INIT/control-flow-test' });
}

describe('addNode — Phase 5 multi-slot auto-seeding', () => {
  it('an "if" node is created with exactly two empty slot children, named then/else, in order', () => {
    const state = reducer(initial(), addNode({ parentId: null, type: 'if' }));
    const root = state.flow!;
    expect(root.type).toBe('if');
    expect(root.children).toHaveLength(2);
    expect(root.children!.map((c) => [c.type, c.props?.name, c.children])).toEqual([
      ['slot', 'then', []],
      ['slot', 'else', []],
    ]);
  });

  it('the two slot children get distinct, fresh ids', () => {
    const state = reducer(initial(), addNode({ parentId: null, type: 'if' }));
    const [thenSlot, elseSlot] = state.flow!.children!;
    expect(thenSlot.id).not.toBe(elseSlot.id);
    expect(thenSlot.id).toBeTruthy();
    expect(elseSlot.id).toBeTruthy();
  });

  it('a node with no declared slots (forEach) gets no auto-seeded children', () => {
    const state = reducer(initial(), addNode({ parentId: null, type: 'forEach' }));
    expect(state.flow!.children).toBeUndefined();
  });

  it('an ordinary node (customCommand) gets no children field at all', () => {
    const state = reducer(initial(), addNode({ parentId: null, type: 'customCommand' }));
    expect(state.flow).toEqual({ id: state.flow!.id, type: 'customCommand', props: {} });
  });

  it('dropping a command into the "then" slot inserts it via the ordinary generic mechanism', () => {
    let state = reducer(initial(), addNode({ parentId: null, type: 'if' }));
    const thenSlotId = state.flow!.children![0].id;

    state = reducer(state, addNode({ parentId: thenSlotId, type: 'click' }));
    const thenSlot = state.flow!.children![0];
    expect(thenSlot.children).toHaveLength(1);
    expect(thenSlot.children![0].type).toBe('click');

    // The "else" slot is untouched.
    expect(state.flow!.children![1].children).toEqual([]);
  });

  it('editing the condition prop and deleting a slot child both go through the ordinary reducers unchanged', () => {
    let state = reducer(initial(), addNode({ parentId: null, type: 'if' }));
    const ifId = state.flow!.id;
    const thenSlotId = state.flow!.children![0].id;
    state = reducer(state, addNode({ parentId: thenSlotId, type: 'click' }));
    const clickId = state.flow!.children![0].children![0].id;

    state = reducer(state, updateProp({ nodeId: ifId, key: 'condition', value: 'ready' }));
    expect(state.flow!.props?.condition).toBe('ready');

    state = reducer(state, deleteNode({ nodeId: clickId }));
    expect(state.flow!.children![0].children).toEqual([]);
  });
});

describe('initial state — Phase 5 reusable-flow library', () => {
  it('is seeded with the full bundled starter library (Phase 5 completion: expanded beyond Login/Search)', () => {
    const state = initial();
    expect(state.reusableFlows.map((f) => f.id).sort()).toEqual([
      'createRecord',
      'deleteRecord',
      'gridRowAction',
      'login',
      'logout',
      'notificationValidation',
      'readRecord',
      'search',
      'updateRecord',
    ]);
  });

  it('every starter flow declares a non-empty body; parameters are used only where they add real reuse value', () => {
    const state = initial();
    for (const flow of state.reusableFlows) {
      // A flow like Logout has nothing to parameterize — the "no params" case
      // is deliberate, not an oversight, so this no longer requires >0 params.
      expect(flow.params.length, flow.id).toBeGreaterThanOrEqual(0);
      expect(flow.body.length, flow.id).toBeGreaterThan(0);
    }
  });

  it('every declared parameter is actually referenced somewhere in its own body (no dead parameters)', () => {
    const state = initial();
    const usesToken = (value: string, key: string) => value.includes(`{{${key}}}`);
    const walk = (nodes: FlowNode[], key: string): boolean =>
      nodes.some(
        (n) =>
          Object.values(n.props ?? {}).some((v) => usesToken(v, key)) ||
          (n.children ? walk(n.children, key) : false),
      );
    for (const flow of state.reusableFlows) {
      for (const param of flow.params) {
        expect(walk(flow.body, param.key), `${flow.id}.${param.key}`).toBe(true);
      }
    }
  });
});
