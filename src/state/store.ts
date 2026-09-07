/**
 * Redux store (HLD §14).
 *
 * The builder slice is the root reducer, so the store state is exactly the HLD
 * AppState: { flow, selectedNodeId, generatedCode } — no additional global state.
 *
 * Phase 1 optional persistence (HLD §15): the store starts from whatever
 * `loadPersistedFlow` restores (silently `null` if there is nothing valid to
 * restore — never a thrown error at startup), and a subscriber writes the flow
 * back to storage whenever it changes. Only `flow` is persisted, never
 * `generatedCode` — reference equality against the last-seen flow is enough to
 * skip redundant writes because `applyFlow` (builderSlice.ts) only ever
 * installs a new flow object when the tree actually changed.
 */

import { configureStore } from '@reduxjs/toolkit';
import builderReducer from './builderSlice';
import { getDefaultReusableFlows } from '../config/reusableFlowsConfig';
import { processFlow } from '../engine/processFlow';
import { loadPersistedFlow, persistFlow } from './persistence';

const persistedFlow = loadPersistedFlow();
const reusableFlows = getDefaultReusableFlows();

export const store = configureStore({
  reducer: builderReducer,
  preloadedState: {
    flow: persistedFlow,
    selectedNodeId: null,
    generatedCode: processFlow(persistedFlow, undefined, reusableFlows),
    isCodeDrawerOpen: false,
    isValidationPanelOpen: false,
    collapsedNodeIds: {},
    reusableFlows,
    history: { past: [], future: [] },
  },
});

let lastPersistedFlow = store.getState().flow;
store.subscribe(() => {
  const { flow } = store.getState();
  if (flow !== lastPersistedFlow) {
    lastPersistedFlow = flow;
    persistFlow(flow);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
