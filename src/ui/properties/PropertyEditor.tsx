/**
 * Property editor / Right Panel (HLD §6.5, §7; Scalable Builder UI, Objective 4).
 *
 * Reads the selected node from the store, derives that node's *context* from the
 * Flow JSON + registry metadata, resolves the context-appropriate property schema,
 * renders a field per property, and dispatches UPDATE_PROP on every change (HLD
 * §13 — no separate save action). It holds no state of its own (HLD §14).
 *
 * The context question is answered in `engine/nodeContext.ts`, not here: this
 * component never inspects a node's type to decide what to show, so a command
 * becomes context-aware through `visibleWhen` / `disabledWhen` metadata alone.
 * `engine/unresolved.ts` resolves schemas through the same function, so a field
 * hidden here can never appear as an unresolved warning anywhere else.
 */

import { useMemo } from 'react';
import { useAppDispatch, useAppSelector, useUnresolvedNodes } from '../../app/hooks';
import { deriveNodeContext, hiddenProps, resolveSchema } from '../../engine/nodeContext';
import { getRegistry } from '../../registry';
import { updateProp } from '../../state/builderSlice';
import { findNode } from '../../state/flowTree';
import { PropertyField } from './PropertyField';

export function PropertyEditor() {
  const dispatch = useAppDispatch();
  const flow = useAppSelector((state) => state.flow);
  const selectedNodeId = useAppSelector((state) => state.selectedNodeId);
  const node = flow && selectedNodeId ? findNode(flow, selectedNodeId) : null;
  const unresolved = useUnresolvedNodes();

  const registry = getRegistry();
  // Derived from the Flow JSON on demand — there is no stored context tree to keep
  // in sync (§19). Recomputed only when the flow or the selection changes.
  const context = useMemo(
    () => deriveNodeContext(flow, selectedNodeId ?? '', registry),
    [flow, selectedNodeId, registry],
  );

  if (!node) {
    return (
      <div className="property-editor property-editor--empty">
        Select a node to edit its properties.
      </div>
    );
  }

  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  const title = def?.label ?? node.type;
  const schema = resolveSchema(node.type, context, registry);
  const hidden = hiddenProps(node.type, context, registry);
  const containerLabel = context.parentType
    ? (registry.getBlock(context.parentType)?.label ?? context.parentType)
    : null;

  // Missing-required-field keys for this node, from the shared unresolved-property
  // detection (app/hooks.ts's useUnresolvedNodes) — the same result the code
  // drawer's warning list and the canvas highlight use.
  const missingKeys = new Set(unresolved.find((u) => u.id === node.id)?.missingKeys ?? []);

  return (
    <div className="property-editor">
      <h2 className="property-editor__title">{title}</h2>
      {containerLabel && (
        <p className="property-editor__context" data-testid="property-context">
          in {containerLabel}
        </p>
      )}

      {schema.length === 0 ? (
        <p className="property-editor__empty-note">No editable properties.</p>
      ) : (
        schema.map(({ def: propDef, disabled }) => (
          <PropertyField
            key={propDef.key}
            def={propDef}
            value={node.props?.[propDef.key] ?? ''}
            isMissing={missingKeys.has(propDef.key)}
            disabled={disabled}
            onChange={(value) =>
              dispatch(updateProp({ nodeId: node.id, key: propDef.key, value }))
            }
          />
        ))
      )}

      {hidden.length > 0 && (
        // Say *why* a field is absent instead of silently dropping it, so the panel
        // stays predictable when the same command shows different fields elsewhere.
        <p className="property-editor__hidden-note" data-testid="property-hidden-note">
          Not applicable here: {hidden.map((prop) => prop.label).join(', ')}
          {context.hasSubject && ' — the subject comes from the previous command.'}
        </p>
      )}
    </div>
  );
}
