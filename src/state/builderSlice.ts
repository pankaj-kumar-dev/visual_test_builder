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
    // node no longer exists (HLD §13).
    deleteNode(state, { payload }: PayloadAction<{ nodeId: string }>) {
      const root = currentFlow(state);
      if (!root) return;
      const flow = removeNode(root, payload.nodeId);
      applyFlow(state, flow);
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
  },
});

export const { addNode, updateProp, deleteNode, selectNode, reorderNode } =
  builderSlice.actions;

export default builderSlice.reducer;
