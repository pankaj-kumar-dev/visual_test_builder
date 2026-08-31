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
import { processFlow } from '../engine/processFlow';
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
  collapsedNodeIds: {},
};

/** Plain snapshot of the current flow, or null. */
function currentFlow(state: AppState): FlowNode | null {
  return state.flow ? current(state.flow) : null;
}

/** Set the flow and re-derive generatedCode. The only place flow/code change. */
function applyFlow(state: AppState, flow: FlowNode | null): void {
  state.flow = flow;
  state.generatedCode = processFlow(flow);
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
  },
});

export const {
  addNode,
  updateProp,
  deleteNode,
  selectNode,
  reorderNode,
  setCodeDrawerOpen,
  toggleNodeCollapse,
  revealNode,
} = builderSlice.actions;

export default builderSlice.reducer;
