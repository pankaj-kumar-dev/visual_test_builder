/**
 * A single node in the rendered flow tree (HLD §7, Center Canvas).
 *
 * Responsibilities:
 *  - render this node's label (resolved from the registry) and recurse children;
 *  - dispatch SELECT_NODE / DELETE_NODE;
 *  - act as a drop target for palette nodes (validation via useNodeDrop).
 *
 * Drag-and-drop rules live in useNodeDrop / dropRules, not inline here.
 */

import type { DragEvent, MouseEvent } from 'react';
import { Fragment } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import type { FlowNode } from '../../domain/types';
import { getRegistry } from '../../registry';
import { deleteNode, selectNode } from '../../state/builderSlice';
import { setActiveDrag, setDragPayload } from '../dnd';
import { SiblingDropZone } from './SiblingDropZone';
import { useNodeDrop } from './useNodeDrop';

interface TreeNodeProps {
  node: FlowNode;
}

const DROP_CLASS: Record<string, string> = {
  valid: ' drop-valid',
  invalid: ' drop-invalid',
};

export function TreeNode({ node }: TreeNodeProps) {
  const dispatch = useAppDispatch();
  const isSelected = useAppSelector((state) => state.selectedNodeId === node.id);
  const { dropState, dropHandlers } = useNodeDrop(node);

  const registry = getRegistry();
  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  const label = def?.label ?? node.type;

  function handleSelect(event: MouseEvent<HTMLDivElement>) {
    // Stop the click from reaching the canvas background (which clears selection).
    event.stopPropagation();
    dispatch(selectNode(node.id));
  }

  function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    dispatch(deleteNode({ nodeId: node.id }));
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
    (DROP_CLASS[dropState] ?? '');

  return (
    <div className="tree-node">
      <div
        className={rowClass}
        data-testid="tree-node"
        data-node-id={node.id}
        draggable
        onClick={handleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        {...dropHandlers}
      >
        <span className="tree-node__label">{label}</span>
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
      {node.children?.length ? (
        <div className="tree-node__children">
          {node.children.map((child, index) => (
            <Fragment key={child.id}>
              <SiblingDropZone parent={node} beforeIndex={index} />
              <TreeNode node={child} />
            </Fragment>
          ))}
          <SiblingDropZone parent={node} beforeIndex={node.children.length} />
        </div>
      ) : null}
    </div>
  );
}
