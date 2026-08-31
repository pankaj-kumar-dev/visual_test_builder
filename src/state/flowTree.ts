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
