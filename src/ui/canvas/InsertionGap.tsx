/**
 * One insertion point between (or around) a container's children (Phase 7,
 * builder UX roadmap). Combines the two ways a new or existing node can land
 * here: `SiblingDropZone` (drag an existing node here to reorder it) and
 * `AddStepPopover` (click "+" to insert a brand-new node here) — both target
 * the exact same gap, so there is one place in the tree that owns "what's at
 * this position", not two drifting mechanisms.
 */

import type { FlowNode } from '../../domain/types';
import { AddStepPopover } from './AddStepPopover';
import { SiblingDropZone } from './SiblingDropZone';

interface InsertionGapProps {
  parent: FlowNode;
  /** Insertion gap: 0 = before the first child, children.length = after the last. */
  beforeIndex: number;
}

export function InsertionGap({ parent, beforeIndex }: InsertionGapProps) {
  return (
    <div className="insertion-gap" data-testid="insertion-gap">
      <SiblingDropZone parent={parent} beforeIndex={beforeIndex} />
      <AddStepPopover parent={parent} beforeIndex={beforeIndex} />
    </div>
  );
}
