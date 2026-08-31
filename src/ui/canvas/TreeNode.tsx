/**
 * A single node in the rendered flow tree (HLD §7, Center Canvas).
 *
 * Responsibilities:
 *  - render this node's label (resolved from the registry) and recurse children;
 *  - dispatch SELECT_NODE / DELETE_NODE / TOGGLE_NODE_COLLAPSE;
 *  - act as a drop target for palette nodes (validation via useNodeDrop);
 *  - show an unresolved-required-property warning (Phase 2 UI) sourced from the
 *    same `findUnresolvedNodes` result the code drawer and property editor use
 *    (threaded down from Canvas as `unresolvedById`, not recomputed here);
 *  - scroll itself into view when it becomes the selected node, so a selection made
 *    from outside the canvas (the drawer's warning list) always lands somewhere
 *    visible (§30).
 *
 * Collapse is pure UI state held in Redux by node id (`state.collapsedNodeIds`) —
 * it never enters the Flow JSON, never reaches `processFlow`, and therefore cannot
 * change the generated code. A collapsed node keeps rendering its own row, so it
 * stays selectable, deletable, draggable, and a valid drop target.
 *
 * Drag-and-drop rules live in useNodeDrop / dropRules, not inline here.
 */

import type { DragEvent, MouseEvent } from 'react';
import { Fragment, memo, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import type { FlowNode } from '../../domain/types';
import { getSchema } from '../../engine/nodeContext';
import { getRegistry } from '../../registry';
import { deleteNode, selectNode, toggleNodeCollapse } from '../../state/builderSlice';
import { setActiveDrag, setDragPayload } from '../dnd';
import { SiblingDropZone } from './SiblingDropZone';
import { useNodeDrop } from './useNodeDrop';

interface TreeNodeProps {
  node: FlowNode;
  /** node id -> human-readable labels of its missing required props. */
  unresolvedById: Map<string, string[]>;
}

const DROP_CLASS: Record<string, string> = {
  valid: ' drop-valid',
  invalid: ' drop-invalid',
};

function TreeNodeView({ node, unresolvedById }: TreeNodeProps) {
  const dispatch = useAppDispatch();
  const isSelected = useAppSelector((state) => state.selectedNodeId === node.id);
  // One boolean per row: an unrelated node's collapse toggle re-renders only that
  // row, not the whole tree.
  const isCollapsed = useAppSelector((state) => !!state.collapsedNodeIds[node.id]);
  const { dropState, dropHandlers } = useNodeDrop(node);
  const missing = unresolvedById.get(node.id);
  const rowRef = useRef<HTMLDivElement>(null);

  const registry = getRegistry();
  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  const label = def?.label ?? node.type;

  // A one-line hint of what this node is configured to do — the first property in
  // schema order that has a value. Generic on purpose: it is what tells fifty
  // "Test Case" rows apart in a large flow without a per-command rendering rule.
  const detail = getSchema(node.type, registry)
    .map((prop) => node.props?.[prop.key]?.trim())
    .find((value) => !!value);

  const childCount = node.children?.length ?? 0;
  const isCollapsible = childCount > 0;
  const showChildren = isCollapsible && !isCollapsed;

  // Bring the selected row into view. `block: 'nearest'` makes this a no-op when the
  // row is already visible, so ordinary clicking doesn't move the canvas; it only
  // acts when selection came from elsewhere (the code drawer's warning list, whose
  // REVEAL_NODE has just expanded this row's ancestors).
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  function handleSelect(event: MouseEvent<HTMLDivElement>) {
    // Stop the click from reaching the canvas background (which clears selection).
    event.stopPropagation();
    dispatch(selectNode(node.id));
  }

  function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    dispatch(deleteNode({ nodeId: node.id }));
  }

  function handleToggleCollapse(event: MouseEvent<HTMLButtonElement>) {
    // Collapsing must not also select — they are independent interactions.
    event.stopPropagation();
    dispatch(toggleNodeCollapse(node.id));
  }

  // Drag source for reordering: publish a `move` payload for this node.
  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    // Prevent an ancestor row from also starting a drag (nested draggables).
    event.stopPropagation();
    const payload = { kind: 'move', nodeId: node.id } as const;
    setDragPayload(event.dataTransfer, payload);
    setActiveDrag(payload);
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setActiveDrag(null);
  }

  const rowClass =
    'tree-node__row' +
    (isSelected ? ' is-selected' : '') +
    (missing ? ' tree-node__row--unresolved' : '') +
    (DROP_CLASS[dropState] ?? '');

  return (
    <div className="tree-node">
      <div
        ref={rowRef}
        className={rowClass}
        data-testid="tree-node"
        data-node-id={node.id}
        data-unresolved={missing ? 'true' : undefined}
        data-collapsed={isCollapsible ? String(isCollapsed) : undefined}
        draggable
        onClick={handleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        {...dropHandlers}
      >
        {isCollapsible ? (
          <button
            type="button"
            className="tree-node__toggle"
            data-testid="node-toggle"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
            onClick={handleToggleCollapse}
          >
            <span aria-hidden="true">{isCollapsed ? '▶' : '▼'}</span>
          </button>
        ) : (
          // Keeps leaf rows aligned with collapsible ones without giving a leaf a
          // control it doesn't need (§12).
          <span className="tree-node__toggle-spacer" aria-hidden="true" />
        )}

        <span className="tree-node__main">
          <span className="tree-node__label">
            {missing && (
              <span className="tree-node__warning-icon" aria-hidden="true">
                !{' '}
              </span>
            )}
            {label}
            {detail && (
              <span className="tree-node__detail" data-testid="tree-node-detail">
                {detail}
              </span>
            )}
            {isCollapsed && (
              <span className="tree-node__child-count" data-testid="node-child-count">
                {childCount}
              </span>
            )}
          </span>
          {missing && (
            <span className="tree-node__missing" data-testid="tree-node-missing">
              {missing.join(', ')}
            </span>
          )}
        </span>
        <button
          type="button"
          className="tree-node__delete"
          data-testid="node-delete"
          onClick={handleDelete}
          aria-label={`Delete ${label}`}
        >
          ×
        </button>
      </div>
      {showChildren ? (
        <div className="tree-node__children">
          {node.children?.map((child, index) => (
            <Fragment key={child.id}>
              <SiblingDropZone parent={node} beforeIndex={index} />
              <TreeNode node={child} unresolvedById={unresolvedById} />
            </Fragment>
          ))}
          <SiblingDropZone parent={node} beforeIndex={childCount} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Memoized: a row re-renders only when its own subtree reference or the shared
 * unresolved map changes. Immutable tree updates rebuild just the path to the
 * edited node, so editing one property in a 200-node flow re-renders that path
 * rather than every row (§15).
 */
export const TreeNode = memo(TreeNodeView);
