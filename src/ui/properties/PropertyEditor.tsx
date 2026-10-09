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

import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector, useSelectedNodeIds, useUnresolvedNodes } from '../../app/hooks';
import type { PropDef } from '../../domain/types';
import { deriveNodeContext, hiddenProps, resolveSchema } from '../../engine/nodeContext';
import { referencesInScope } from '../../engine/references';
import { resolveInvocationSchema } from '../../engine/reusableFlows';
import { getRegistry } from '../../registry';
import {
  clearMultiSelect,
  deleteSelectedNodes,
  duplicateSelectedNodes,
  saveAsReusableFlow,
  updateProp,
} from '../../state/builderSlice';
import { findNode, nodesInDocumentOrder } from '../../state/flowTree';
import { SaveAsFlowDialog } from '../common/SaveAsFlowDialog';
import { PropertyField } from './PropertyField';

/**
 * Phase 8, multi-select: the right panel's content when more than one node is
 * selected. Editing one arbitrary node's fields would be meaningless (and
 * ambiguous — *which* of the selected nodes?), so the panel instead offers
 * the bulk actions that make a multi-selection worth having in the first
 * place, mirroring the single-row context menu's own action set.
 */
function BulkSelectionPanel({ selectedIds }: { selectedIds: string[] }) {
  const dispatch = useAppDispatch();
  const flow = useAppSelector((state) => state.flow);
  const [isSavingFlow, setIsSavingFlow] = useState(false);

  // "Save as reusable flow" additionally requires the selection to be a
  // coherent ordered sequence of siblings (state/flowTree.ts's own rule,
  // re-checked by the reducer itself) — Duplicate/Delete have no such
  // requirement, so only this one button is conditionally disabled.
  const canSaveAsFlow = useMemo(() => {
    if (!flow) return false;
    return nodesInDocumentOrder(flow, selectedIds).length === selectedIds.length;
  }, [flow, selectedIds]);

  return (
    <div className="property-editor property-editor--bulk" data-testid="bulk-selection-panel">
      <h2 className="property-editor__title">{selectedIds.length} steps selected</h2>
      <p className="property-editor__context">Ctrl/Cmd-click a row to add or remove it.</p>

      <div className="property-editor__bulk-actions">
        <button
          type="button"
          className="property-editor__bulk-action"
          data-testid="bulk-duplicate"
          onClick={() => dispatch(duplicateSelectedNodes())}
        >
          Duplicate all
        </button>
        <button
          type="button"
          className="property-editor__bulk-action"
          data-testid="bulk-save-flow"
          disabled={!canSaveAsFlow}
          title={canSaveAsFlow ? undefined : 'Select steps within the same group to save as a flow.'}
          onClick={() => setIsSavingFlow(true)}
        >
          Save as reusable flow
        </button>
        <button
          type="button"
          className="property-editor__bulk-action property-editor__bulk-action--danger"
          data-testid="bulk-delete"
          onClick={() => dispatch(deleteSelectedNodes())}
        >
          Delete all
        </button>
        <button
          type="button"
          className="property-editor__bulk-action property-editor__bulk-action--ghost"
          data-testid="bulk-clear"
          onClick={() => dispatch(clearMultiSelect())}
        >
          Clear selection
        </button>
      </div>

      {isSavingFlow && (
        <SaveAsFlowDialog
          nodeCount={selectedIds.length}
          onCancel={() => setIsSavingFlow(false)}
          onSave={(name) => {
            dispatch(saveAsReusableFlow({ nodeIds: selectedIds, name }));
            setIsSavingFlow(false);
          }}
        />
      )}
    </div>
  );
}

export function PropertyEditor() {
  const dispatch = useAppDispatch();
  const flow = useAppSelector((state) => state.flow);
  const selectedNodeId = useAppSelector((state) => state.selectedNodeId);
  const reusableFlows = useAppSelector((state) => state.reusableFlows);
  const selectedIds = useSelectedNodeIds();
  const node = flow && selectedNodeId ? findNode(flow, selectedNodeId) : null;
  const unresolved = useUnresolvedNodes();

  const registry = getRegistry();
  // Derived from the Flow JSON on demand — there is no stored context tree to keep
  // in sync (§19). Recomputed only when the flow or the selection changes.
  const context = useMemo(
    () => deriveNodeContext(flow, selectedNodeId ?? '', registry),
    [flow, selectedNodeId, registry],
  );
  // Phase 3: names available to the "insert reference" picker on any
  // `acceptsReference` field — derived the same way engine/references.ts's
  // semantic validator resolves a consumption, so the picker can never offer a
  // name the validator would then reject.
  const availableReferences = useMemo(
    () => Array.from(referencesInScope(flow, selectedNodeId ?? '', registry)).sort(),
    [flow, selectedNodeId, registry],
  );
  // Phase 7: progressive disclosure — collapsed by default, reset whenever
  // the selection changes so expanding Advanced on one node never leaks into
  // the next one selected.
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
    setShowAdvanced(false);
  }, [selectedNodeId]);

  if (selectedIds.length > 1) {
    return <BulkSelectionPanel selectedIds={selectedIds} />;
  }

  if (!node) {
    return (
      <div className="property-editor property-editor--empty">
        Select a node to edit its properties.
      </div>
    );
  }

  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  const title = def?.label ?? node.type;
  // Phase 5: a reusable-flow invocation has no *static* schema in the registry
  // (only a fixed `flowId` picker) — its argument fields are derived per
  // instance from whichever definition is selected (engine/reusableFlows.ts),
  // reusing the exact same PropDef shape and `<PropertyField>` rendering below,
  // so this stays "one static registry entry", never a component per flow.
  const isReuseInvocation = !!def && 'childComposition' in def && def.childComposition === 'reuse';
  const schema: { def: PropDef; disabled: boolean }[] = isReuseInvocation
    ? resolveInvocationSchema(node, reusableFlows).map((propDef) => ({ def: propDef, disabled: false }))
    : resolveSchema(node.type, context, registry);
  const hidden = isReuseInvocation ? [] : hiddenProps(node.type, context, registry);
  const containerLabel = context.parentType
    ? (registry.getBlock(context.parentType)?.label ?? context.parentType)
    : null;

  // Missing-required-field keys for this node, from the shared unresolved-property
  // detection (app/hooks.ts's useUnresolvedNodes) — the same result the code
  // drawer's warning list and the canvas highlight use.
  const missingKeys = new Set(unresolved.find((u) => u.id === node.id)?.missingKeys ?? []);

  // Phase 7: progressive disclosure — split once, render as two lists. A
  // field is never silently lost either way: it's always in exactly one of
  // the two, same `schema` source, just partitioned by `PropDef.advanced`.
  const primary = schema.filter(({ def: propDef }) => !propDef.advanced);
  const advanced = schema.filter(({ def: propDef }) => propDef.advanced);
  const advancedMissingCount = advanced.filter(({ def: propDef }) => missingKeys.has(propDef.key)).length;

  function renderField({ def: propDef, disabled }: { def: PropDef; disabled: boolean }) {
    return (
      <PropertyField
        key={propDef.key}
        def={propDef}
        value={node!.props?.[propDef.key] ?? ''}
        isMissing={missingKeys.has(propDef.key)}
        disabled={disabled}
        availableReferences={availableReferences}
        onChange={(value) => dispatch(updateProp({ nodeId: node!.id, key: propDef.key, value }))}
      />
    );
  }

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
        primary.map(renderField)
      )}

      {advanced.length > 0 && (
        <div className="property-editor__advanced">
          <button
            type="button"
            className="property-editor__advanced-toggle"
            data-testid="property-advanced-toggle"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            <span aria-hidden="true">{showAdvanced ? '▾' : '▸'}</span> Advanced
            {!showAdvanced && advancedMissingCount > 0 && (
              <span className="property-editor__advanced-badge" data-testid="property-advanced-badge">
                {advancedMissingCount}
              </span>
            )}
          </button>
          {showAdvanced && advanced.map(renderField)}
        </div>
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
