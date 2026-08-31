/**
 * Typed Redux hooks (HLD §14).
 *
 * The only sanctioned way for components to read the store and dispatch actions.
 * Components never touch the store directly and never mutate the Flow JSON.
 */

import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../state/store';
import { findUnresolvedNodes, type UnresolvedNode } from '../engine/unresolved';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/**
 * Single source of truth for "which nodes/fields are unresolved" (Phase 2 UI).
 * The code drawer's warning list, the canvas's per-node highlighting, and the
 * property editor's per-field highlighting all read from this one hook instead
 * of each re-running (or re-implementing) the detection independently.
 */
export function useUnresolvedNodes(): UnresolvedNode[] {
  const flow = useAppSelector((state) => state.flow);
  return useMemo(() => findUnresolvedNodes(flow), [flow]);
}
