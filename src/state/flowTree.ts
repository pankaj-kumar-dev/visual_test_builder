/**
 * Pure, immutable operations on the Flow JSON tree (HLD §8, §14).
 *
 * None of these functions mutate their input. Each returns a new tree, reusing
 * the references of unchanged subtrees so that only the path to the affected node
 * is rebuilt. No React, no Redux, no side effects.
 */

import type { FlowNode } from '../domain/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Find a node by id anywhere in the tree, or null if absent. */
export function findNode(root: FlowNode, id: string): FlowNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Ids of every node on the path from the root down to (but excluding) `id`.
 * Returns null when `id` is not in the tree. Used to expand a hidden node's
 * ancestors when something outside the canvas — the code drawer's unresolved
 * warning list — needs to reveal it.
 */
export function findAncestorIds(root: FlowNode, id: string): string[] | null {
  if (root.id === id) return [];
  for (const child of root.children ?? []) {
    const below = findAncestorIds(child, id);
    if (below) return [root.id, ...below];
  }
  return null;
}

/** Ids of `node` and every descendant. Used to clean up per-node UI state on delete. */
export function collectSubtreeIds(node: FlowNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectSubtreeIds)];
}

/**
 * Every node id in the order its row actually renders on screen — a
 * depth-first walk that stops descending into a node whose children are
 * currently collapsed (Phase 8 shift-click range-select: the range between
 * two rows must match what the user visually sees between them, not the
 * full tree including rows hidden under a collapsed ancestor). Mirrors
 * `TreeNode.tsx`'s own `showChildren` rule exactly — a node with children
 * renders them unless `collapsedNodeIds` marks it collapsed; a childless
 * node has nothing to recurse into regardless of its collapsed flag (stale
 * collapse state from an emptied-out container is simply inert here, same
 * as it already is in the canvas itself).
 */
export function flattenVisibleIds(
  node: FlowNode,
  collapsedNodeIds: Record<string, true>,
): string[] {
  const children = node.children ?? [];
  const isCollapsed = !!collapsedNodeIds[node.id] && children.length > 0;
  if (isCollapsed) return [node.id];
  return [node.id, ...children.flatMap((child) => flattenVisibleIds(child, collapsedNodeIds))];
}

/**
 * The `FlowNode`s for `ids`, in their shared parent's child order — the
 * single source of truth for "is this a coherent sibling selection" (Phase 8
 * multi-select's "save as reusable flow" bulk action, which needs an ordered
 * sequence of statements under one parent, the same shape every bundled
 * reusable-flow body already has).
 *
 * A single id is always valid — trivially "a selection of one node", with no
 * parent requirement (even the root qualifies). For more than one id, every
 * one of them must be a *direct child of the same parent*; if any isn't
 * (including the root itself, which has no parent to share, or an id from an
 * entirely different branch), the result's length comes back shorter than
 * `ids.length` — callers compare the two to detect an incoherent selection
 * rather than silently acting on a wrong or partial one.
 */
export function nodesInDocumentOrder(root: FlowNode, ids: readonly string[]): FlowNode[] {
  if (ids.length === 0) return [];
  if (ids.length === 1) {
    const node = findNode(root, ids[0]);
    return node ? [node] : [];
  }
  const found = findParentAndIndex(root, ids[0]);
  if (!found) return [];
  const idSet = new Set(ids);
  return (found.parent.children ?? []).filter((child) => idSet.has(child.id));
}

/**
 * Return a new tree in which the node with `id` is replaced by `transform(node)`.
 * If no node matches, the original tree is returned unchanged (same reference).
 */
function replaceNode(
  root: FlowNode,
  id: string,
  transform: (node: FlowNode) => FlowNode,
): FlowNode {
  if (root.id === id) return transform(root);
  if (!root.children?.length) return root;

  let changed = false;
  const children = root.children.map((child) => {
    const next = replaceNode(child, id, transform);
    if (next !== child) changed = true;
    return next;
  });

  return changed ? { ...root, children } : root;
}

/**
 * Insert `node` into the tree.
 * - If the tree is empty (`root === null`), `node` becomes the root.
 * - Otherwise `node` is inserted into `parentId`'s children at `index`
 *   (appended when `index` is omitted or out of range).
 * - If `parentId` is null but a root already exists, there is no valid target
 *   and the tree is returned unchanged (single-tree model, HLD §18.6).
 */
export function insertNode(
  root: FlowNode | null,
  parentId: string | null,
  node: FlowNode,
  index?: number,
): FlowNode {
  if (root === null) return node;
  if (parentId === null) return root;

  return replaceNode(root, parentId, (parent) => {
    const children = parent.children ?? [];
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    const nextChildren = [...children.slice(0, at), node, ...children.slice(at)];
    return { ...parent, children: nextChildren };
  });
}

/** Return a new tree with `props[key] = value` on the node with `id`. */
export function updateNodeProps(
  root: FlowNode,
  id: string,
  key: string,
  value: string,
): FlowNode {
  return replaceNode(root, id, (node) => ({
    ...node,
    props: { ...node.props, [key]: value },
  }));
}

/**
 * Return a new tree with the node `id` and its entire subtree removed.
 * Returns null if the removed node was the root (HLD §13).
 */
export function removeNode(root: FlowNode, id: string): FlowNode | null {
  if (root.id === id) return null;
  return pruneChildren(root, id);
}

/** Remove `id` from wherever it appears below `node`. Never removes `node` itself. */
function pruneChildren(node: FlowNode, id: string): FlowNode {
  if (!node.children?.length) return node;

  let changed = false;
  const nextChildren: FlowNode[] = [];
  for (const child of node.children) {
    if (child.id === id) {
      changed = true;
      continue;
    }
    const pruned = pruneChildren(child, id);
    if (pruned !== child) changed = true;
    nextChildren.push(pruned);
  }

  return changed ? { ...node, children: nextChildren } : node;
}

/**
 * Deep-copy `node`, assigning every node in the subtree a fresh id via
 * `generateId`. Exported (beyond `duplicateSubtree`'s own use below) for
 * Phase 8's template instantiation — loading the same starter template twice
 * must never produce two nodes sharing an id.
 */
export function cloneWithNewIds(node: FlowNode, generateId: () => string): FlowNode {
  return {
    ...node,
    id: generateId(),
    props: node.props ? { ...node.props } : undefined,
    children: node.children?.map((child) => cloneWithNewIds(child, generateId)),
  };
}

/**
 * `id`'s parent and its index within the parent's children, or null if `id`
 * is the root or absent. Exported (beyond this file's own use) for Phase 8's
 * multi-select, which needs to confirm a set of ids are actual siblings
 * before offering to bundle them into one reusable-flow body.
 */
export function findParentAndIndex(
  root: FlowNode,
  id: string,
): { parent: FlowNode; index: number } | null {
  const children = root.children ?? [];
  for (let index = 0; index < children.length; index += 1) {
    if (children[index].id === id) return { parent: root, index };
    const found = findParentAndIndex(children[index], id);
    if (found) return found;
  }
  return null;
}

/**
 * Return a new tree with a deep copy of the node `id` (fresh ids throughout,
 * via `generateId`) inserted as its next sibling, immediately after the
 * original (Phase 6, node actions). A no-op (same reference) when `id` is the
 * root itself — there is no parent to insert a sibling into (single-tree
 * model, HLD §18.6) — or when `id` is not present in the tree.
 */
export function duplicateSubtree(
  root: FlowNode,
  id: string,
  generateId: () => string,
): FlowNode {
  const found = findParentAndIndex(root, id);
  if (!found) return root;

  const clone = cloneWithNewIds(found.parent.children![found.index], generateId);
  return replaceNode(root, found.parent.id, (parent) => {
    const children = parent.children ?? [];
    const at = found.index + 1;
    return { ...parent, children: [...children.slice(0, at), clone, ...children.slice(at)] };
  });
}

/**
 * Move the node `id` to `toIndex` within its current parent's children (HLD §13,
 * reordering is within the same parent). `toIndex` is clamped to a valid range.
 * Returns the original tree unchanged if the move is a no-op.
 */
export function moveNode(root: FlowNode, id: string, toIndex: number): FlowNode {
  if (!root.children?.length) return root;

  const from = root.children.findIndex((child) => child.id === id);
  if (from !== -1) {
    const to = clamp(toIndex, 0, root.children.length - 1);
    if (from === to) return root;
    const reordered = [...root.children];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    return { ...root, children: reordered };
  }

  let changed = false;
  const children = root.children.map((child) => {
    const next = moveNode(child, id, toIndex);
    if (next !== child) changed = true;
    return next;
  });

  return changed ? { ...root, children } : root;
}

/**
 * Move the node `id` `delta` positions within its current parent's children
 * (Phase 6, node actions — `delta: -1`/`+1` for "move up"/"move down" in a
 * context menu, as a named alternative to drag-and-drop reordering). Thin
 * wrapper over `moveNode`: finds the node's own current index first so the
 * caller never has to know it, then clamps/no-ops exactly as `moveNode` already
 * does for an out-of-range or unchanged position.
 */
export function moveNodeBy(root: FlowNode, id: string, delta: number): FlowNode {
  const found = findParentAndIndex(root, id);
  if (!found) return root;
  return moveNode(root, id, found.index + delta);
}
