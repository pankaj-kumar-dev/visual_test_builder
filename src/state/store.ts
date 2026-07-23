/**
 * Redux store (HLD §14).
 *
 * The builder slice is the root reducer, so the store state is exactly the HLD
 * AppState: { flow, selectedNodeId, generatedCode } — no additional global state.
 */

import { configureStore } from '@reduxjs/toolkit';
import builderReducer from './builderSlice';

export const store = configureStore({
  reducer: builderReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
