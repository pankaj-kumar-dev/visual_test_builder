/**
 * A drop target in the gap between (and around) sibling nodes (HLD §13).
 *
 * Single responsibility: accept a `move` drag and dispatch REORDER_NODE to place
 * the dragged node at this gap. It only accepts nodes that are already children of
 * `parent` — reordering is within the same parent; cross-parent moves are rejected.
 */

import type { DragEvent } from 'react';
import { useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import type { FlowNode } from '../../domain/types';
import { reorderNode } from '../../state/builderSlice';
import { getActiveDrag, readDragPayload } from '../dnd';
import { reorderTargetIndex } from './dropRules';

interface SiblingDropZoneProps {
  parent: FlowNode;
  /** Insertion gap: 0 = before first child, children.length = after last. */
  beforeIndex: number;
}

function isSibling(parent: FlowNode, nodeId: string): boolean {
  return (parent.children ?? []).some((child) => child.id === nodeId);
}

export function SiblingDropZone({ parent, beforeIndex }: SiblingDropZoneProps) {
  const dispatch = useAppDispatch();
  const [active, setActive] = useState(false);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    const drag = getActiveDrag();
    if (drag?.kind === 'move' && isSibling(parent, drag.nodeId)) {
      event.preventDefault();
      setActive(true);
    }
  }

  function onDragLeave() {
    setActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setActive(false);
    const payload = readDragPayload(event.dataTransfer);
    if (payload?.kind !== 'move') return;
    const toIndex = reorderTargetIndex(
      parent.children ?? [],
      payload.nodeId,
      beforeIndex,
    );
    if (toIndex !== null) {
      dispatch(reorderNode({ nodeId: payload.nodeId, toIndex }));
    }
  }

  return (
    <div
      className={`sibling-drop-zone${active ? ' is-active' : ''}`}
      data-testid="drop-zone"
      data-parent-id={parent.id}
      data-before-index={beforeIndex}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    />
  );
}
