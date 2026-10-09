/**
 * Whole-app keyboard shortcuts (Phase 6, builder UX roadmap).
 *
 * Delete, Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo), and Ctrl/Cmd+D
 * (duplicate) — the shortcuts the header's Undo/Redo buttons already *claim*
 * in their `title` tooltips (Header.tsx) but that, until now, no listener
 * actually implemented.
 *
 * Delete and Ctrl/Cmd+D dispatch the Phase 8 bulk reducers
 * (`deleteSelectedNodes`/`duplicateSelectedNodes`), not the single-node ones
 * — those already act on just `selectedNodeId` whenever multi-select is
 * empty (`state/builderSlice.ts`'s `effectiveSelectedIds`), so this one
 * listener correctly handles both "one node selected" and "several selected"
 * with no branch of its own.
 *
 * A single document-level listener, mounted once from `App`, rather than one
 * per `TreeNode` row — there is exactly one current selection (HLD §13 plus
 * Phase 8's multi-select extension), so there only needs to be one place
 * deciding what a shortcut does with it.
 */

import { useEffect } from 'react';
import { useAppDispatch, useSelectedNodeIds } from './hooks';
import { deleteSelectedNodes, duplicateSelectedNodes, redo, undo } from '../state/builderSlice';

/** Whether `target` is a text-editing control — shortcuts defer to native
 * editing behavior there (e.g. Ctrl+Z undoing a text edit, Delete removing a
 * character) instead of acting on the selected flow node(s). */
function isEditingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useKeyboardShortcuts(): void {
  const dispatch = useAppDispatch();
  const selectedIds = useSelectedNodeIds();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditingContext(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;

      if (meta && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch(event.shiftKey ? redo() : undo());
        return;
      }

      if (meta && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'd') {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        dispatch(duplicateSelectedNodes());
        return;
      }

      if (!meta && event.key === 'Delete' && selectedIds.length > 0) {
        event.preventDefault();
        dispatch(deleteSelectedNodes());
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch, selectedIds]);
}
