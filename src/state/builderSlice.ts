/**
 * The application state slice (HLD §10, §14).
 *
 * Holds exactly the three fields defined by the HLD and exposes exactly the five
 * defined actions. `generatedCode` is always derived from `processFlow(flow)` via
 * `applyFlow`; no action sets it directly.
 *
 * Tree mutations are performed by the pure helpers in `flowTree.ts`, given a plain
 * snapshot of the draft (via Immer's `current`) so the pure layer never sees a
 * draft proxy.
 */

import { createSlice, current, type PayloadAction } from '@reduxjs/toolkit';
import type { AppState, FlowNode } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { processFlow } from '../engine/processFlow';
import { createSlotChildren } from '../engine/slots';
import { getRegistry } from '../registry';
import {
  collectSubtreeIds,
  findAncestorIds,
  findNode,
  insertNode,
  moveNode,
  removeNode,
  updateNodeProps,
} from './flowTree';

const initialState: AppState = {
  flow: null,
  selectedNodeId: null,
  generatedCode: '',
  isCodeDrawerOpen: false,
  isValidationPanelOpen: false,
  collapsedNodeIds: {},
  reusableFlows: getDefaultReusableFlows(),
  history: { past: [], future: [] },
};

/** Plain snapshot of the current flow, or null. */
function currentFlow(state: AppState): FlowNode | null {
  return state.flow ? current(state.flow) : null;
}

/**
 * Set the flow and re-derive generatedCode — the only place flow/code change,
 * and (Phase 5) the one choke point undo/redo hangs off. A mutation that
 * produces the exact same flow reference (a pure `state/flowTree.ts` helper's
 * own no-op detection, e.g. reordering to the same index, or deleting an id
 * that isn't there) is skipped entirely — nothing changed, so nothing is
 * recomputed and no history entry is recorded.
 *
 * `recordHistory` is false only for undo/redo themselves (builderSlice.ts's
 * `undo`/`redo` reducers): they must move the flow between `past`/`future`
 * without *also* pushing a new entry, or an undo would immediately create
 * something to "redo past" other than what the user actually undid.
 */
function applyFlow(
  state: AppState,
  flow: FlowNode | null,
  options: { recordHistory?: boolean } = {},
): void {
  const { recordHistory = true } = options;
  // Compare against a plain snapshot, not the live Immer draft proxy at
  // `state.flow` — the two are never reference-equal even when nothing
  // changed (a proxy is never `===` the plain object it wraps), which would
  // silently defeat this no-op check every time. `before` and the `flow`
  // callers pass in both ultimately derive from the same `currentFlow(state)`
  // call, so an unchanged tree really does arrive here as the same reference.
  const before = currentFlow(state);
  if (flow === before) return;
  if (recordHistory) {
    state.history.past.push(before);
    state.history.future = [];
  }
  state.flow = flow;
  state.generatedCode = processFlow(flow, getRegistry(), current(state.reusableFlows));
}

/**
 * Generate a node id. Uses crypto.randomUUID when available; falls back to a
 * timestamp+random id in environments where it is not (e.g. an insecure context,
 * where crypto.randomUUID is undefined). Uniqueness is only required within a
 * single flow tree (HLD §18.3), so the fallback is sufficient.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface AddNodeInput {
  parentId: string | null;
  type: string;
  index?: number;
}

interface AddNodePayload extends AddNodeInput {
  id: string;
}

interface UpdatePropPayload {
  nodeId: string;
  key: string;
  value: string;
}

interface ReorderNodePayload {
  nodeId: string;
  toIndex: number;
}

const builderSlice = createSlice({
  name: 'builder',
  initialState,
  reducers: {
    // ADD_NODE — create a new node and insert it at the drop position (HLD §11).
    // The id is generated in `prepare` to keep the reducer pure (HLD §18.3).
    addNode: {
      reducer(state, { payload }: PayloadAction<AddNodePayload>) {
        const node: FlowNode = { id: payload.id, type: payload.type, props: {} };
        // Phase 5: a multi-slot host (`StructuralNodeDef.slots`, e.g. `if`'s
        // ["then", "else"]) gets one empty `slot` wrapper per declared name up
        // front — driven entirely by that metadata, never by `payload.type`,
        // so any future multi-slot construct is seeded the same way with no
        // new code here (engine/slots.ts).
        const slots = getRegistry().getBlock(payload.type)?.slots;
        if (slots) node.children = createSlotChildren(slots, generateId);
        const flow = insertNode(currentFlow(state), payload.parentId, node, payload.index);
        applyFlow(state, flow);
        // Dropping into a collapsed parent expands it, so the new child is visible
        // where the user just put it rather than silently disappearing.
        if (payload.parentId) delete state.collapsedNodeIds[payload.parentId];
      },
      prepare(input: AddNodeInput) {
        return { payload: { ...input, id: generateId() } };
      },
    },

    // UPDATE_PROP — write a single property value on a node (HLD §11).
    updateProp(state, { payload }: PayloadAction<UpdatePropPayload>) {
      const root = currentFlow(state);
      if (!root) return;
      applyFlow(state, updateNodeProps(root, payload.nodeId, payload.key, payload.value));
    },

    // DELETE_NODE — remove a node and its subtree; clear selection if the selected
    // node no longer exists (HLD §13), and drop the per-node UI state of everything
    // that was removed so collapse flags can't leak or accumulate.
    deleteNode(state, { payload }: PayloadAction<{ nodeId: string }>) {
      const root = currentFlow(state);
      if (!root) return;
      const removed = findNode(root, payload.nodeId);
      const flow = removeNode(root, payload.nodeId);
      applyFlow(state, flow);
      if (removed) {
        for (const id of collectSubtreeIds(removed)) delete state.collapsedNodeIds[id];
      }
      if (
        state.selectedNodeId &&
        (flow === null || findNode(flow, state.selectedNodeId) === null)
      ) {
        state.selectedNodeId = null;
      }
    },

    // LOAD_FLOW — replace the entire flow (Phase 1 import/localStorage restore).
    // Selection and collapse state are per-node UI state keyed to the previous
    // tree's ids, which have no guaranteed meaning in the incoming tree, so both
    // are reset rather than carried over. Undo history is reset too (Phase 5):
    // undoing an import back to whatever the canvas held a moment ago is not a
    // meaningful operation, so a fresh load starts a fresh history instead of
    // recording the discarded flow as one more undo step.
    loadFlow(state, { payload }: PayloadAction<FlowNode | null>) {
      applyFlow(state, payload, { recordHistory: false });
      state.selectedNodeId = null;
      state.collapsedNodeIds = {};
      state.history = { past: [], future: [] };
    },

    // SELECT_NODE — set (or clear) the selected node (HLD §13). Does not touch flow.
    selectNode(state, { payload }: PayloadAction<string | null>) {
      state.selectedNodeId = payload;
    },

    // REORDER_NODE — move a node within its parent's children (HLD §13).
    reorderNode(state, { payload }: PayloadAction<ReorderNodePayload>) {
      const root = currentFlow(state);
      if (!root) return;
      applyFlow(state, moveNode(root, payload.nodeId, payload.toIndex));
    },

    // SET_CODE_DRAWER_OPEN — open/close the code drawer (Phase 2 UI). Pure UI
    // state; does not touch flow or generatedCode.
    setCodeDrawerOpen(state, { payload }: PayloadAction<boolean>) {
      state.isCodeDrawerOpen = payload;
    },

    // SET_VALIDATION_PANEL_OPEN — open/close the dedicated validation panel
    // (Phase 5F). Pure UI state, independent of the code drawer's own flag —
    // does not touch flow or generatedCode.
    setValidationPanelOpen(state, { payload }: PayloadAction<boolean>) {
      state.isValidationPanelOpen = payload;
    },

    // TOGGLE_NODE_COLLAPSE — collapse/expand one tree node (Scalable Builder UI).
    // Keyed by the node's stable id, never by position, so reordering siblings
    // can't hand one node's expansion state to another. Pure UI state: it does not
    // touch `flow`, so `generatedCode` is not (and cannot be) re-derived here.
    toggleNodeCollapse(state, { payload }: PayloadAction<string>) {
      if (state.collapsedNodeIds[payload]) {
        delete state.collapsedNodeIds[payload];
      } else {
        state.collapsedNodeIds[payload] = true;
      }
    },

    // REVEAL_NODE — select a node and expand whatever is hiding it (§30/§31).
    // Used by the code drawer's unresolved-property list, where the offending node
    // may sit inside a collapsed ancestor. Ancestors come from the Flow JSON, so
    // there is no second source of "where is this node" to keep in sync.
    revealNode(state, { payload }: PayloadAction<string>) {
      state.selectedNodeId = payload;
      const root = currentFlow(state);
      if (!root) return;
      for (const ancestorId of findAncestorIds(root, payload) ?? []) {
        delete state.collapsedNodeIds[ancestorId];
      }
    },

    // UNDO — restore the most recent `past` snapshot, pushing the current flow
    // onto `future` (Phase 5). A no-op (not an error) when there is nothing to
    // undo. Goes through `applyFlow` with `recordHistory: false` so undoing
    // never itself creates a new undo step. Selection is cleared if it no
    // longer resolves in the restored tree, the same rule `deleteNode` already
    // applies for the same reason (a stale id pointing at nothing).
    undo(state) {
      const previous = state.history.past.pop();
      if (previous === undefined) return;
      state.history.future.push(currentFlow(state));
      applyFlow(state, previous, { recordHistory: false });
      if (state.selectedNodeId && (previous === null || findNode(previous, state.selectedNodeId) === null)) {
        state.selectedNodeId = null;
      }
    },

    // REDO — the mirror image of `undo`: restore the most recent `future`
    // snapshot, pushing the current flow back onto `past`. A no-op when there
    // is nothing to redo.
    redo(state) {
      const next = state.history.future.pop();
      if (next === undefined) return;
      state.history.past.push(currentFlow(state));
      applyFlow(state, next, { recordHistory: false });
      if (state.selectedNodeId && (next === null || findNode(next, state.selectedNodeId) === null)) {
        state.selectedNodeId = null;
      }
    },
  },
});

export const {
  addNode,
  updateProp,
  deleteNode,
  loadFlow,
  selectNode,
  reorderNode,
  setCodeDrawerOpen,
  setValidationPanelOpen,
  toggleNodeCollapse,
  revealNode,
  undo,
  redo,
} = builderSlice.actions;

export default builderSlice.reducer;
