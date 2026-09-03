/**
 * Generic multi-slot composition (Phase 5).
 *
 * A node whose registry definition declares `slots: string[]` (StructuralNodeDef,
 * e.g. `if`'s `["then", "else"]`) does not compose an ordinary flat child list.
 * Instead each declared name gets exactly one wrapper child of the single,
 * reusable `slot` node type (registered once in building-blocks.json, never
 * per-construct), holding that slot's own ordinary children. This is the whole
 * mechanism: any future multi-slot construct declares its own `slots` array and
 * gets slot-grouped children, drop validation, and generation for free — see
 * `engine/processFlow.ts`'s single `{{slot:name}}` token handling and
 * `resolveProps`'s `[[slot:name: ...]]` optional-segment handling, neither of
 * which branches on which *host* node it is.
 *
 * Pure: no React, no Redux, no side effects.
 */

import type { FlowNode } from '../domain/types';

/** The one generic structural node type used for every named slot, of any host. */
export const SLOT_NODE_TYPE = 'slot';

/** The `slot` node's own prop key holding which slot name it represents. */
export const SLOT_NAME_KEY = 'name';

/** The slot name `node` represents, or null if it isn't a slot wrapper at all. */
export function slotNameOf(node: FlowNode): string | null {
  if (node.type !== SLOT_NODE_TYPE) return null;
  return node.props?.[SLOT_NAME_KEY] ?? null;
}

/** The slot wrapper named `slotName` directly under `node`, or null if absent. */
export function findSlotChild(node: FlowNode, slotName: string): FlowNode | null {
  return (node.children ?? []).find((child) => slotNameOf(child) === slotName) ?? null;
}

/** Whether the slot named `slotName` under `node` has at least one child of its own. */
export function slotHasContent(node: FlowNode, slotName: string): boolean {
  return (findSlotChild(node, slotName)?.children?.length ?? 0) > 0;
}

/**
 * Build one empty `slot` wrapper per declared name, in order — called once
 * when a multi-slot host node is created (state/builderSlice.ts's `addNode`),
 * driven entirely by `StructuralNodeDef.slots`, never by the host's `type`.
 */
export function createSlotChildren(slots: string[], generateId: () => string): FlowNode[] {
  return slots.map((name) => ({
    id: generateId(),
    type: SLOT_NODE_TYPE,
    props: { [SLOT_NAME_KEY]: name },
    children: [],
  }));
}

/**
 * Structural validity of `node`'s own children against its own `slots`
 * declaration (or lack of one) — checked from both directions in a single
 * rule, generic over any host/slot pair (engine/unresolved.ts calls this once
 * per node in its existing traversal, the same "one generic sweep" shape as
 * every other structural check there):
 *  - a node that *declares* `slots`: every child must be a `slot` wrapper whose
 *    name is one of the declared ones (a stray ordinary child, or a `slot`
 *    tagged with an undeclared/edited-away name, is invalid);
 *  - a node that does *not* declare `slots`: no child may be a `slot` wrapper
 *    at all (a `slot` node only ever makes sense directly under its declaring
 *    host — e.g. one dropped elsewhere via a hand-edited import).
 */
export function hasInvalidSlotPlacement(node: FlowNode, slots: string[] | undefined): boolean {
  const children = node.children ?? [];
  if (slots) {
    return children.some((child) => {
      const name = slotNameOf(child);
      return name === null || !slots.includes(name);
    });
  }
  return children.some((child) => child.type === SLOT_NODE_TYPE);
}
