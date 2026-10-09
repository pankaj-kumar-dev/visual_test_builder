/**
 * Flow canvas / Center Panel (HLD §6.4, §7).
 *
 * Step 1 responsibility: read the flow tree from the store and render it. Shows an
 * empty state when there is no flow. It owns no flow state (HLD §6.4) — it reads
 * from the store and, in later steps, dispatches actions.
 */

import type { DragEvent } from 'react';
import { useMemo } from 'react';
import { useAppDispatch, useAppSelector, useSemanticIssues, useUnresolvedNodes } from '../../app/hooks';
import { addNode, selectNode } from '../../state/builderSlice';
import { readDragPayload } from '../dnd';
import { TemplatesPanel } from './TemplatesPanel';
import { TreeNode } from './TreeNode';

export function Canvas() {
  const dispatch = useAppDispatch();
  const flow = useAppSelector((state) => state.flow);
  const unresolved = useUnresolvedNodes();
  const semanticIssues = useSemanticIssues();
  // Computed once per render here (not per TreeNode instance) and threaded down,
  // so a large tree doesn't re-run findUnresolvedNodes once per row.
  const unresolvedById = useMemo(
    () => new Map(unresolved.map((u) => [u.id, u.missing])),
    [unresolved],
  );
  // Phase 3: same "compute once, thread down" shape for semantic issues —
  // kept in a separate map, never merged with unresolvedById (§ CodeDrawer).
  const semanticIssueById = useMemo(
    () => new Map(semanticIssues.map((s) => [s.id, s.message])),
    [semanticIssues],
  );

  // Clicking the empty canvas background clears the current selection (HLD §13).
  function handleBackgroundClick() {
    dispatch(selectNode(null));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  // A palette drop on the empty canvas creates the root node (HLD §18.6:
  // a single tree). When a root already exists, background drops are ignored;
  // nodes must be dropped onto an existing node.
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (flow) return;
    const payload = readDragPayload(event.dataTransfer);
    if (payload?.kind === 'palette') {
      dispatch(addNode({ parentId: null, type: payload.nodeType }));
    }
  }

  if (!flow) {
    return (
      <div
        className="canvas canvas--empty"
        data-testid="canvas"
        onClick={handleBackgroundClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <TemplatesPanel />
      </div>
    );
  }

  return (
    <div
      className="canvas"
      data-testid="canvas"
      onClick={handleBackgroundClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TreeNode node={flow} unresolvedById={unresolvedById} semanticIssueById={semanticIssueById} />
    </div>
  );
}
