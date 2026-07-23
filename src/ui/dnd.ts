/**
 * Drag-and-drop data contract (HLD §13).
 *
 * Single responsibility: serialize/deserialize the payload carried on a native
 * drag via DataTransfer. The palette writes a `palette` payload (a new node type);
 * the canvas writes a `move` payload (an existing node id) when reordering, and
 * reads both on drop.
 */

/** Custom MIME type so drops from unrelated sources are ignored. */
export const DRAG_MIME = 'application/x-vtb-node';

export type DragPayload =
  | { kind: 'palette'; nodeType: string }
  | { kind: 'move'; nodeId: string };

export function setDragPayload(dt: DataTransfer, payload: DragPayload): void {
  dt.setData(DRAG_MIME, JSON.stringify(payload));
}

/**
 * Transient in-memory holder for the payload of the drag in progress.
 *
 * Browsers only expose DataTransfer contents on `drop`, not during `dragover`,
 * so drop targets cannot read the dragged type while hovering. Drag sources
 * publish their payload here on drag start (and clear it on drag end) so targets
 * can validate and highlight during hover. This is transient UI state for a single
 * drag gesture — not application/business state (HLD §14).
 */
let activeDrag: DragPayload | null = null;

export function setActiveDrag(payload: DragPayload | null): void {
  activeDrag = payload;
}

export function getActiveDrag(): DragPayload | null {
  return activeDrag;
}

/** Read the payload from a drag event, or null if absent/malformed. */
export function readDragPayload(dt: DataTransfer): DragPayload | null {
  const raw = dt.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed.kind === 'palette' && typeof parsed.nodeType === 'string') {
      return parsed;
    }
    if (parsed.kind === 'move' && typeof parsed.nodeId === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
