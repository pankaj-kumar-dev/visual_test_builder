/**
 * Property editor / Right Panel (HLD §6.5, §7).
 *
 * Reads the selected node from the store and its property schema from the registry,
 * renders a field per property, and dispatches UPDATE_PROP on every change (HLD
 * §13 — no separate save action). It holds no state of its own (HLD §14).
 */

import { useAppDispatch, useAppSelector } from '../../app/hooks';
import type { PropDef } from '../../domain/types';
import { getRegistry } from '../../registry';
import { updateProp } from '../../state/builderSlice';
import { findNode } from '../../state/flowTree';
import { PropertyField } from './PropertyField';

export function PropertyEditor() {
  const dispatch = useAppDispatch();
  const node = useAppSelector((state) =>
    state.flow && state.selectedNodeId
      ? findNode(state.flow, state.selectedNodeId)
      : null,
  );

  if (!node) {
    return (
      <div className="property-editor property-editor--empty">
        Select a node to edit its properties.
      </div>
    );
  }

  const registry = getRegistry();
  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  // Structural props live on the block definition; command props in the registry.
  const schema: PropDef[] = registry.getBlock(node.type)?.props ?? registry.getProps(node.type);
  const title = def?.label ?? node.type;

  return (
    <div className="property-editor">
      <h2 className="property-editor__title">{title}</h2>
      {schema.length === 0 ? (
        <p className="property-editor__empty-note">No editable properties.</p>
      ) : (
        schema.map((propDef) => (
          <PropertyField
            key={propDef.key}
            def={propDef}
            value={node.props?.[propDef.key] ?? ''}
            onChange={(value) =>
              dispatch(updateProp({ nodeId: node.id, key: propDef.key, value }))
            }
          />
        ))
      )}
    </div>
  );
}
