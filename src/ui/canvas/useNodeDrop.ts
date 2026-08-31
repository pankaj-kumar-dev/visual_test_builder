/**
 * Drop behavior for a single tree node (HLD §13).
 *
 * Focused hook that keeps drag-and-drop logic out of the recursive TreeNode
 * rendering. It validates a palette drop against the registry's allowedChildren,
 * exposes a hover state for highlighting, and dispatches ADD_NODE on a valid drop.
 * Reordering (move payloads) is handled by the sibling drop zones, not here.
 */

import type { DragEvent } from 'react';
import { useState } from 'react';
import { useAppDispatch } from '../../app/hooks';
import type { FlowNode } from '../../domain/types';
import { getRegistry } from '../../registry';
import { addNode } from '../../state/builderSlice';
import { getActiveDrag, readDragPayload } from '../dnd';
import { canDropInto } from './dropRules';

export type DropState = 'idle' | 'valid' | 'invalid';

export interface NodeDropHandlers {
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function useNodeDrop(node: FlowNode): {
  dropState: DropState;
  dropHandlers: NodeDropHandlers;
} {
  const dispatch = useAppDispatch();
  const registry = getRegistry();
  const [dropState, setDropState] = useState<DropState>('idle');

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    const active = getActiveDrag();
    // Only palette drops target a node as parent; ignore move drags here.
    if (active?.kind !== 'palette') return;

    if (canDropInto(node.type, active.nodeType, registry, node.children ?? [])) {
      // preventDefault marks this as a valid drop target so `drop` will fire.
      event.preventDefault();
      setDropState('valid');
    } else {
      // No preventDefault → the browser rejects the drop (HLD §13).
      setDropState('invalid');
    }
  }

  function onDragLeave() {
    setDropState('idle');
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDropState('idle');
    const payload = readDragPayload(event.dataTransfer);
    if (
      payload?.kind === 'palette' &&
      canDropInto(node.type, payload.nodeType, registry, node.children ?? [])
    ) {
      dispatch(addNode({ parentId: node.id, type: payload.nodeType }));
    }
  }

  return { dropState, dropHandlers: { onDragOver, onDragLeave, onDrop } };
}
