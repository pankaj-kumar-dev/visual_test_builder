/**
 * A single draggable palette chip (HLD §7, Left Panel).
 *
 * Single responsibility: present one node type and start a `palette` drag that
 * carries its type. It holds no state and dispatches nothing.
 */

import type { DragEvent } from 'react';
import { setActiveDrag, setDragPayload } from '../dnd';

interface PaletteItemProps {
  type: string;
  label: string;
}

export function PaletteItem({ type, label }: PaletteItemProps) {
  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    const payload = { kind: 'palette', nodeType: type } as const;
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
      data-testid={`palette-item-${type}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`Drag "${label}" onto the canvas`}
    >
      {label}
    </div>
  );
}
