/**
 * Typed Redux hooks (HLD §14).
 *
 * The only sanctioned way for components to read the store and dispatch actions.
 * Components never touch the store directly and never mutate the Flow JSON.
 */

import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../state/store';
import { buildSpec, type BuiltSpec } from '../engine/buildSpec';
import { checkSpecSyntax, type CompileCheckResult } from '../engine/compileCheck';
import { processFlowAnnotatedSpec } from '../engine/processFlow';
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

/**
 * Single source of truth for "which node ids are currently selected" (Phase
 * 8, multi-select): `multiSelectedIds` when non-empty, else the single
 * `selectedNodeId` wrapped in a one-element array (or none). Every consumer
 * that needs to know "what's selected right now" — the tree's row
 * highlighting, the property editor's single-vs-bulk branch, the bulk action
 * handlers — reads through this one hook rather than re-deriving the same
 * "empty multi-select falls back to the primary" rule independently.
 */
export function useSelectedNodeIds(): string[] {
  const selectedNodeId = useAppSelector((state) => state.selectedNodeId);
  const multiSelectedIds = useAppSelector((state) => state.multiSelectedIds);
  return useMemo(() => {
    const multi = Object.keys(multiSelectedIds);
    if (multi.length > 0) return multi;
    return selectedNodeId ? [selectedNodeId] : [];
  }, [selectedNodeId, multiSelectedIds]);
}

/**
 * Phase 9 ("Build Test" compile-ready export): the assembled spec/commands
 * pair (`engine/buildSpec.ts`) plus the syntax-check result
 * (`engine/compileCheck.ts`) against it, recomputed only when `flow` or
 * `reusableFlows` actually change — the same "derive, never store" rule
 * every other engine-backed hook here already follows. `null` for an empty
 * canvas, mirroring `buildSpec`'s own null-for-nothing-to-build contract.
 */
export function useBuildResult(): { built: BuiltSpec; check: CompileCheckResult } | null {
  const flow = useAppSelector((state) => state.flow);
  const reusableFlows = useAppSelector((state) => state.reusableFlows);
  return useMemo(() => {
    const built = buildSpec(flow, undefined, reusableFlows);
    if (!built) return null;
    const check = checkSpecSyntax(processFlowAnnotatedSpec(flow, undefined, reusableFlows));
    return { built, check };
  }, [flow, reusableFlows]);
}
