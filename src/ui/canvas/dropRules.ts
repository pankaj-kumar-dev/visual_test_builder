/**
 * UI drop-validation rules (HLD §13).
 *
 * These are interaction rules only — they decide whether a drag may land on a
 * target. Structural updates remain in the state layer. The rule is sourced from
 * the registry's `allowedChildren`, never hardcoded per node type.
 */

import type { FlowNode } from '../../domain/types';
import type { Registry } from '../../registry';

/**
 * Whether a node of `childType` may be dropped as a child of `parentType`.
 * True only when the parent is a structural block whose `allowedChildren`
 * includes the child type. Command nodes are leaves and accept no children.
 */
export function canDropInto(
  parentType: string,
  childType: string,
  registry: Registry,
): boolean {
  const parent = registry.getBlock(parentType);
  return parent ? parent.allowedChildren.includes(childType) : false;
}

/**
 * Resolve the REORDER_NODE target index for dropping `nodeId` at the gap before
 * `beforeIndex` within `children` (reordering is within the same parent, HLD §13).
 *
 * Returns null when `nodeId` is not a current sibling — a cross-parent move, which
 * is out of scope and must be rejected.
 *
 * `beforeIndex` is an insertion gap in the original array (0..children.length).
 * When the node moves downward (beforeIndex past its current slot), the target is
 * shifted by one to account for the node's own removal, matching moveNode, which
 * treats its index as the final position.
 */
export function reorderTargetIndex(
  children: FlowNode[],
  nodeId: string,
  beforeIndex: number,
): number | null {
  const from = children.findIndex((child) => child.id === nodeId);
  if (from === -1) return null;
  return beforeIndex > from ? beforeIndex - 1 : beforeIndex;
}
