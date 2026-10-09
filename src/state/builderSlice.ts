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
import type { AppState, FlowNode, ReusableFlowDef } from '../domain/types';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { processFlow } from '../engine/processFlow';
import { slugifyFlowName } from '../engine/reusableFlows';
import { createSlotChildren } from '../engine/slots';
import { getRegistry } from '../registry';
import {
  collectSubtreeIds,
  duplicateSubtree,
  findAncestorIds,
  findNode,
  flattenVisibleIds,
  insertNode,
  moveNode,
  moveNodeBy as moveNodeByDelta,
  nodesInDocumentOrder,
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
  multiSelectedIds: {},
  rangeAnchorId: null,
  isBuildPanelOpen: false,
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
 *
 * Exported (beyond this slice's own use) for Phase 8's template instantiation:
 * the UI layer clones a bundled `TestTemplateDef`'s flow with fresh ids
 * (`state/flowTree.ts`'s `cloneWithNewIds`) before dispatching `loadFlow`, so
 * it needs the exact same id generator this slice uses for every other node.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The effective selected set (Phase 8, multi-select): `multiSelectedIds` when
 * non-empty, else the single `selectedNodeId` (or none). Single source of
 * truth for "what should a bulk action act on" — every bulk reducer below
 * reads through this, never through either field directly. */
function effectiveSelectedIds(state: AppState): string[] {
  const multi = Object.keys(state.multiSelectedIds);
  if (multi.length > 0) return multi;
  return state.selectedNodeId ? [state.selectedNodeId] : [];
}

/** Plain (non-Immer-proxied, same ids) deep copy — used when a node is copied
 * into a different part of state (Phase 8's reusable-flow body) that must
 * never alias the live flow tree's objects. */
function cloneFlowNodePlain(node: FlowNode): FlowNode {
  return {
    ...node,
    props: node.props ? { ...node.props } : undefined,
    children: node.children?.map(cloneFlowNodePlain),
  };
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
      delete state.multiSelectedIds[payload.nodeId];
      if (
        state.selectedNodeId &&
        (flow === null || findNode(flow, state.selectedNodeId) === null)
      ) {
        state.selectedNodeId = null;
      }
    },

    // DUPLICATE_NODE — insert a deep copy of a node (fresh ids throughout) as
    // its next sibling, then select the copy (Phase 6, node actions). Id
    // generation for the cloned subtree happens inside the reducer body via
    // the shared `generateId`, the same precedent ADD_NODE already sets for a
    // multi-slot host's seeded children above — `prepare` only needs to cover
    // a single id when exactly one new node is created (HLD §18.3); here the
    // subtree's size isn't known until `flowTree.ts`'s pure clone walks it.
    duplicateNode(state, { payload }: PayloadAction<{ nodeId: string }>) {
      const root = currentFlow(state);
      if (!root) return;
      let cloneId: string | null = null;
      const flow = duplicateSubtree(root, payload.nodeId, () => {
        const id = generateId();
        if (cloneId === null) cloneId = id;
        return id;
      });
      applyFlow(state, flow);
      if (flow !== root && cloneId !== null) {
        state.selectedNodeId = cloneId;
        state.multiSelectedIds = {};
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
      state.multiSelectedIds = {};
      state.rangeAnchorId = null;
    },

    // SELECT_NODE — set (or clear) the selected node (HLD §13), and exit
    // multi-select (Phase 8): a plain, unmodified click is always an
    // exclusive single selection. Also becomes the new shift-click range
    // anchor, so the next shift-click extends a range from here. Does not
    // touch flow.
    selectNode(state, { payload }: PayloadAction<string | null>) {
      state.selectedNodeId = payload;
      state.multiSelectedIds = {};
      state.rangeAnchorId = payload;
    },

    // REORDER_NODE — move a node within its parent's children (HLD §13).
    reorderNode(state, { payload }: PayloadAction<ReorderNodePayload>) {
      const root = currentFlow(state);
      if (!root) return;
      applyFlow(state, moveNode(root, payload.nodeId, payload.toIndex));
    },

    // MOVE_NODE_BY — "move up"/"move down" from a node's context menu (Phase 6),
    // a named alternative to REORDER_NODE's drag-and-drop absolute index.
    moveNodeBy(state, { payload }: PayloadAction<{ nodeId: string; delta: number }>) {
      const root = currentFlow(state);
      if (!root) return;
      applyFlow(state, moveNodeByDelta(root, payload.nodeId, payload.delta));
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

    // SET_BUILD_PANEL_OPEN — open/close the "Build Test" compile-ready panel
    // (Phase 9). Pure UI state, independent of the other two panels' own
    // flags — does not touch flow or generatedCode.
    setBuildPanelOpen(state, { payload }: PayloadAction<boolean>) {
      state.isBuildPanelOpen = payload;
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
      state.multiSelectedIds = {};
      state.rangeAnchorId = payload;
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
      state.multiSelectedIds = {};
      state.rangeAnchorId = state.selectedNodeId;
      if (state.selectedNodeId && (previous === null || findNode(previous, state.selectedNodeId) === null)) {
        state.selectedNodeId = null;
        state.rangeAnchorId = null;
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
      state.multiSelectedIds = {};
      state.rangeAnchorId = state.selectedNodeId;
      if (state.selectedNodeId && (next === null || findNode(next, state.selectedNodeId) === null)) {
        state.selectedNodeId = null;
        state.rangeAnchorId = null;
      }
    },

    // TOGGLE_MULTI_SELECT — Ctrl/Cmd+click a row (Phase 8): add/
    // remove it from the multi-selection. Starting a multi-select from an
    // existing plain single selection seeds the set with that node first, so
    // the node the user already had selected is never silently dropped the
    // moment they extend the selection. The just-toggled node also becomes
    // `selectedNodeId` (the "most recently touched" one) — irrelevant once
    // more than one node is selected (the property panel shows a bulk summary
    // instead of single-node fields either way), but keeps it meaningful the
    // instant the set shrinks back down to one.
    toggleMultiSelect(state, { payload }: PayloadAction<string>) {
      const next: Record<string, true> = { ...state.multiSelectedIds };
      if (Object.keys(next).length === 0 && state.selectedNodeId) {
        next[state.selectedNodeId] = true;
      }
      if (next[payload]) delete next[payload];
      else next[payload] = true;
      state.multiSelectedIds = next;
      state.selectedNodeId = payload;
      // Also becomes the new range anchor — the next shift-click extends
      // from the node the user just explicitly toggled, not from wherever
      // multi-select happened to start.
      state.rangeAnchorId = payload;
    },

    // SELECT_RANGE — Shift+click a row (Phase 8): select every row visually
    // between the current range anchor and this one (inclusive), matching
    // the file-manager convention. Unlike `TOGGLE_MULTI_SELECT`, this
    // *replaces* the multi-selection with the computed range rather than
    // adding to it, and deliberately does not move `rangeAnchorId` — a
    // second shift-click at a different row re-computes the range from the
    // same fixed anchor, not from the previous shift-click's endpoint. Falls
    // back to an ordinary single selection (and adopts `payload` as the new
    // anchor) when there is no anchor yet, or it no longer resolves in the
    // tree (its node was deleted, or a new flow was loaded) — a missing
    // anchor is treated as "nothing to extend from" rather than an error.
    selectRange(state, { payload }: PayloadAction<string>) {
      const root = currentFlow(state);
      if (!root) return;
      const anchor = state.rangeAnchorId;
      const order = flattenVisibleIds(root, state.collapsedNodeIds);
      const anchorIndex = anchor === null ? -1 : order.indexOf(anchor);
      const targetIndex = order.indexOf(payload);
      if (anchorIndex === -1 || targetIndex === -1) {
        state.selectedNodeId = payload;
        state.multiSelectedIds = {};
        state.rangeAnchorId = payload;
        return;
      }
      const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      state.multiSelectedIds = Object.fromEntries(order.slice(from, to + 1).map((id) => [id, true as const]));
      state.selectedNodeId = payload;
    },

    // CLEAR_MULTI_SELECT — drop back to a plain single selection (Phase 8),
    // e.g. the bulk action bar's "Clear" button, or clicking the canvas
    // background. `selectedNodeId` is left as-is; only the "also these
    // others" extension goes away.
    clearMultiSelect(state) {
      state.multiSelectedIds = {};
    },

    // DELETE_SELECTED_NODES — remove every node in the effective selection
    // (Phase 8 bulk action), whatever their relation to each other — unlike
    // `saveSelectionAsReusableFlow` below, deletion has no need for the
    // selected nodes to be siblings. Reuses the exact same per-node cleanup
    // `DELETE_NODE` already does (collapse-state cleanup for the removed
    // subtree), just looped.
    deleteSelectedNodes(state) {
      const ids = effectiveSelectedIds(state);
      if (ids.length === 0) return;
      let root = currentFlow(state);
      for (const id of ids) {
        if (root === null) break;
        const removed = findNode(root, id);
        root = removeNode(root, id);
        if (removed) {
          for (const subId of collectSubtreeIds(removed)) delete state.collapsedNodeIds[subId];
        }
      }
      applyFlow(state, root);
      state.selectedNodeId = null;
      state.multiSelectedIds = {};
    },

    // DUPLICATE_SELECTED_NODES — insert a deep copy of every node in the
    // effective selection as its own next sibling (Phase 8 bulk action), then
    // select every new copy — the multi-select analogue of `DUPLICATE_NODE`.
    // No sibling requirement, same reasoning as delete above.
    duplicateSelectedNodes(state) {
      const ids = effectiveSelectedIds(state);
      if (ids.length === 0) return;
      let root = currentFlow(state);
      if (!root) return;
      const cloneIds: string[] = [];
      for (const id of ids) {
        let firstId: string | null = null;
        const next = duplicateSubtree(root, id, () => {
          const newId = generateId();
          if (firstId === null) firstId = newId;
          return newId;
        });
        if (next !== root && firstId !== null) cloneIds.push(firstId);
        root = next;
      }
      applyFlow(state, root);
      if (cloneIds.length > 0) {
        state.multiSelectedIds = Object.fromEntries(cloneIds.map((id) => [id, true as const]));
        state.selectedNodeId = cloneIds[cloneIds.length - 1];
      }
    },

    // SAVE_AS_REUSABLE_FLOW — bundle an explicit set of node ids into a new
    // zero-parameter `ReusableFlowDef` appended to the library (Phase 8,
    // reusable-flow authoring). Explicit `nodeIds`, not the implicit
    // "effective selection" `deleteSelectedNodes`/`duplicateSelectedNodes`
    // read — this action is only ever triggered by a dialog the UI already
    // opened with specific ids in hand (one row's context menu passes just
    // that row; the bulk-selection panel passes `useSelectedNodeIds()`), so
    // there's no ambiguity to resolve inside the reducer, unlike a keyboard
    // shortcut that must act on "whatever is currently selected" with no ids
    // of its own to pass. The ids *do* need to be a coherent ordered
    // sequence — `nodesInDocumentOrder` (state/flowTree.ts) returns fewer
    // nodes than ids when that's not the case (e.g. two different parents),
    // and the reducer silently no-ops rather than saving a wrong/partial
    // body; the UI layer checks the same function before ever offering the
    // action, so this is a defensive second check, not the primary gate.
    // Parameterizing the saved flow (replacing a literal with a `{{token}}`)
    // is out of scope here — same as the bundled starter flows with
    // `params: []` (e.g. "Logout"), this is a fully valid, immediately
    // invocable reusable flow as-is.
    saveAsReusableFlow(state, { payload }: PayloadAction<{ nodeIds: string[]; name: string }>) {
      const root = currentFlow(state);
      if (!root) return;
      const nodes = nodesInDocumentOrder(root, payload.nodeIds);
      if (nodes.length === 0 || nodes.length !== payload.nodeIds.length) return;

      const existingIds = state.reusableFlows.map((def) => def.id);
      const id = slugifyFlowName(payload.name, existingIds);
      const def: ReusableFlowDef = {
        id,
        name: payload.name.trim() || id,
        params: [],
        body: nodes.map(cloneFlowNodePlain),
      };
      state.reusableFlows.push(def);
    },
  },
});

export const {
  addNode,
  updateProp,
  deleteNode,
  duplicateNode,
  loadFlow,
  selectNode,
  reorderNode,
  moveNodeBy,
  setCodeDrawerOpen,
  setValidationPanelOpen,
  setBuildPanelOpen,
  toggleNodeCollapse,
  revealNode,
  undo,
  redo,
  toggleMultiSelect,
  selectRange,
  clearMultiSelect,
  deleteSelectedNodes,
  duplicateSelectedNodes,
  saveAsReusableFlow,
} = builderSlice.actions;

export default builderSlice.reducer;
