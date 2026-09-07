/**
 * Dedicated validation panel (Phase 5F).
 *
 * The engine already computes every validation fact through two pure,
 * single-source-of-truth functions — `findUnresolvedNodes` (structural: a
 * required field is empty, a block/slot body is empty, a slot is misplaced,
 * a switch's case/default cardinality is violated) and `findSemanticIssues`
 * (meaning: a reference resolves to nothing, is used out of order/scope,
 * shadows an earlier one, or a reusable-flow invocation is unknown/cyclic) —
 * exposed via `app/hooks.ts`'s `useUnresolvedNodes`/`useSemanticIssues`, the
 * exact same hooks the canvas (TreeNode highlighting) and the property editor
 * (per-field highlighting) already read. This panel adds no third
 * computation and no new rule: it is a pure renderer over those two results,
 * grouped by severity (`engine/references.ts`'s `SemanticIssueSeverity` —
 * every unresolved-property entry counts as an error, the same way a
 * required field being empty always has), so "the engine remains the source
 * of truth" holds structurally, not just by convention.
 *
 * Distinct from `ui/output/CodeDrawer.tsx`, which already renders its own
 * inline warning lists beside the generated code — this panel is additive
 * (a separate open/close flag, `state.isValidationPanelOpen`) rather than a
 * replacement, so existing code-drawer behavior/tests are untouched.
 */

import { useEffect, useRef } from 'react';
import { useAppDispatch, useSemanticIssues, useUnresolvedNodes } from '../../app/hooks';
import type { UnresolvedNode } from '../../engine/unresolved';
import type { SemanticIssue } from '../../engine/references';
import { revealNode, setValidationPanelOpen } from '../../state/builderSlice';

interface ValidationRow {
  key: string;
  nodeId: string;
  label: string;
  message: string;
}

/** Collapse an `UnresolvedNode` entry into the panel's one-row-per-issue shape. */
function rowsFromUnresolved(node: UnresolvedNode): ValidationRow {
  return {
    key: `unresolved-${node.id}`,
    nodeId: node.id,
    label: node.label,
    message: node.missing.join(', '),
  };
}

function rowFromSemanticIssue(issue: SemanticIssue, index: number): ValidationRow {
  return {
    key: `semantic-${issue.id}-${issue.kind}-${index}`,
    nodeId: issue.id,
    label: issue.label,
    message: issue.message,
  };
}

export function ValidationPanel() {
  const dispatch = useAppDispatch();
  const unresolved = useUnresolvedNodes();
  const semanticIssues = useSemanticIssues();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const semanticErrors = semanticIssues.filter((issue) => issue.severity === 'error');
  const semanticWarnings = semanticIssues.filter((issue) => issue.severity === 'warning');

  // Every unresolved-property/structural finding is an error — a required
  // field being empty (or a switch missing its one Case, or a Try with no
  // Catch) is never merely advisory.
  const errorRows: ValidationRow[] = [
    ...unresolved.map(rowsFromUnresolved),
    ...semanticErrors.map((issue, index) => rowFromSemanticIssue(issue, index)),
  ];
  const warningRows: ValidationRow[] = semanticWarnings.map((issue, index) => rowFromSemanticIssue(issue, index));

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dispatch(setValidationPanelOpen(false));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  function handleClose() {
    dispatch(setValidationPanelOpen(false));
  }

  // Selecting an issue reuses REVEAL_NODE (state/builderSlice.ts) — the same
  // single "jump to this node" mechanism the code drawer's warning lists
  // already use: it selects the node *and* expands every collapsed ancestor
  // hiding it, with no duplicate "where is this node" logic here.
  function handleRowClick(nodeId: string) {
    dispatch(revealNode(nodeId));
  }

  const hasIssues = errorRows.length > 0 || warningRows.length > 0;

  return (
    <aside
      // Reuses `.code-drawer`'s layout rules (grid sizing, slide-in
      // animation, the desktop/tablet/mobile responsive breakpoints) —
      // this panel occupies the exact same 4th-column workspace slot, so
      // there is no separate layout stylesheet to keep in sync; only its
      // own `validation-panel__*` classes are new (index.css).
      className="validation-panel code-drawer"
      data-testid="validation-panel"
      role="dialog"
      aria-label="Validation"
    >
      <div className="validation-panel__header code-drawer__header">
        <h2 className="validation-panel__title code-drawer__title">Validation</h2>
        <button
          type="button"
          className="validation-panel__close code-drawer__close"
          data-testid="validation-panel-close"
          onClick={handleClose}
          aria-label="Close validation panel"
          ref={closeButtonRef}
        >
          ×
        </button>
      </div>

      <div className="validation-panel__summary">
        <span
          className={`validation-panel__count validation-panel__count--error${errorRows.length > 0 ? ' has-issues' : ''}`}
          data-testid="validation-error-count"
        >
          {errorRows.length} {errorRows.length === 1 ? 'Error' : 'Errors'}
        </span>
        <span
          className={`validation-panel__count validation-panel__count--warning${warningRows.length > 0 ? ' has-issues' : ''}`}
          data-testid="validation-warning-count"
        >
          {warningRows.length} {warningRows.length === 1 ? 'Warning' : 'Warnings'}
        </span>
      </div>

      <div className="validation-panel__body code-drawer__body">
        {!hasIssues && (
          <p className="validation-panel__empty" data-testid="validation-empty">
            No validation issues. This flow is ready to generate.
          </p>
        )}

        {errorRows.length > 0 && (
          <ul className="validation-panel__list" data-testid="validation-error-list">
            {errorRows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className="validation-panel__item validation-panel__item--error"
                  data-testid="validation-issue"
                  data-severity="error"
                  onClick={() => handleRowClick(row.nodeId)}
                >
                  <span className="validation-panel__item-badge" aria-hidden="true">
                    ERROR
                  </span>
                  <span className="validation-panel__item-label">{row.label}</span>
                  <span className="validation-panel__item-message">{row.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {warningRows.length > 0 && (
          <ul className="validation-panel__list" data-testid="validation-warning-list">
            {warningRows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className="validation-panel__item validation-panel__item--warning"
                  data-testid="validation-issue"
                  data-severity="warning"
                  onClick={() => handleRowClick(row.nodeId)}
                >
                  <span className="validation-panel__item-badge" aria-hidden="true">
                    WARNING
                  </span>
                  <span className="validation-panel__item-label">{row.label}</span>
                  <span className="validation-panel__item-message">{row.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
