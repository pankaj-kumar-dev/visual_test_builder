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
import { findSemanticIssues, type SemanticIssue } from '../engine/references';

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
  const reusableFlows = useAppSelector((state) => state.reusableFlows);
  return useMemo(() => findUnresolvedNodes(flow, undefined, reusableFlows), [flow, reusableFlows]);
}

/**
 * Single source of truth for Phase 3 *semantic* issues (unknown/out-of-order/
 * out-of-scope references, shadowed aliases) — deliberately a separate hook
 * from `useUnresolvedNodes`, mirroring `engine/unresolved.ts`'s structural
 * checks vs `engine/references.ts`'s semantic ones staying two mechanisms.
 */
export function useSemanticIssues(): SemanticIssue[] {
  const flow = useAppSelector((state) => state.flow);
  const reusableFlows = useAppSelector((state) => state.reusableFlows);
  return useMemo(() => findSemanticIssues(flow, undefined, reusableFlows), [flow, reusableFlows]);
}
