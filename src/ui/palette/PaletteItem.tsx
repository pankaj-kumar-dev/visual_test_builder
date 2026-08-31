/**
 * A single draggable palette chip (HLD §7, Left Panel).
 *
 * Single responsibility: present one node and start a `palette` drag that carries
 * its type. It holds no state and dispatches nothing. The category listing and the
 * search results both render this same component with the same payload, so a
 * filtered result drags, validates, and inserts exactly like an unfiltered one
 * (§32) — there is only ever one insertion path.
 */

import type { DragEvent } from 'react';
import { setActiveDrag, setDragPayload } from '../dnd';
import type { PaletteNode } from './paletteModel';

interface PaletteItemProps {
  node: PaletteNode;
}

export function PaletteItem({ node }: PaletteItemProps) {
  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    const payload = { kind: 'palette', nodeType: node.type } as const;
    setDragPayload(event.dataTransfer, payload);
    setActiveDrag(payload);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function handleDragEnd() {
    setActiveDrag(null);
  }

  return (
    <div
      className="palette__item"
      data-testid={`palette-item-${node.type}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={node.description ?? `Drag "${node.label}" onto the canvas`}
    >
      {node.label}
    </div>
  );
}
