/**
 * Application header / whole-flow toolbar.
 *
 * Keeps flow-level actions together while the workspace below stays focused on
 * building, inspecting, and validating the current scenario.
 */

import { useRef, useState, type ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector, useSemanticIssues, useUnresolvedNodes } from './hooks';
import { loadFlow, redo, setCodeDrawerOpen, setValidationPanelOpen, undo } from '../state/builderSlice';
import { FlowImportError, parseFlowJson, serializeFlow } from '../state/flowIO';

export function Header() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.isCodeDrawerOpen);
  const isValidationPanelOpen = useAppSelector((state) => state.isValidationPanelOpen);
  const flow = useAppSelector((state) => state.flow);
  const canUndo = useAppSelector((state) => state.history.past.length > 0);
  const canRedo = useAppSelector((state) => state.history.future.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const unresolved = useUnresolvedNodes();
  const semanticIssues = useSemanticIssues();
  const issueCount =
    unresolved.length + semanticIssues.filter((issue) => issue.severity === 'error').length;

  function handleExport() {
    const blob = new Blob([serializeFlow(flow)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'flow.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseFlowJson(text);
      dispatch(loadFlow(imported));
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof FlowImportError ? error.message : 'Could not read that file.');
    }
  }

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden="true">VT</span>
        <div className="app-header__identity">
          <strong className="app-header__title">Visual Test Builder</strong>
          <span className="app-header__subtitle">Cypress test authoring</span>
        </div>
      </div>

      <div className="app-header__flow">
        <span className="app-header__flow-label">CURRENT FLOW</span>
        <strong>Untitled test scenario</strong>
        <span className="app-header__flow-status">Local draft</span>
      </div>

      <div className="app-header__actions">
        <div className="app-header__group" aria-label="History">
          <button type="button" className="app-header__icon-action" data-testid="undo-button" disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd + Z)" onClick={() => dispatch(undo())}>
            <span aria-hidden="true">↶</span><span className="app-header__button-label">Undo</span>
          </button>
          <button type="button" className="app-header__icon-action" data-testid="redo-button" disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd + Shift + Z)" onClick={() => dispatch(redo())}>
            <span aria-hidden="true">↷</span><span className="app-header__button-label">Redo</span>
          </button>
        </div>

        <div className="app-header__group" aria-label="Flow file actions">
          <button type="button" className="app-header__action" data-testid="export-flow" onClick={handleExport}>Export</button>
          <button type="button" className="app-header__action" data-testid="import-flow" onClick={handleImportClick}>Import</button>
          <input ref={fileInputRef} type="file" accept="application/json" data-testid="import-flow-input" className="app-header__file-input" onChange={handleFileSelected} />
        </div>

        <div className="app-header__group app-header__group--primary" aria-label="Build tools">
          <button type="button" className={`app-header__toggle${isValidationPanelOpen ? ' is-active' : ''}`} data-testid="validation-toggle" aria-pressed={isValidationPanelOpen} aria-label={isValidationPanelOpen ? 'Close validation panel' : 'Open validation panel'} onClick={() => {
            dispatch(setValidationPanelOpen(!isValidationPanelOpen));
            if (!isValidationPanelOpen) dispatch(setCodeDrawerOpen(false));
          }}>
            <span className="app-header__toggle-icon" aria-hidden="true">✓</span>Validate
            {issueCount > 0 && <span className="app-header__badge" data-testid="validation-badge-count">{issueCount}</span>}
          </button>
          <button type="button" className={`app-header__toggle app-header__toggle--code${isOpen ? ' is-active' : ''}`} data-testid="code-toggle" aria-pressed={isOpen} aria-label={isOpen ? 'Close generated code drawer' : 'Open generated code drawer'} onClick={() => {
            dispatch(setCodeDrawerOpen(!isOpen));
            if (!isOpen) dispatch(setValidationPanelOpen(false));
          }}>
            <span className="app-header__toggle-icon" aria-hidden="true">&lt;/&gt;</span>Code
          </button>
        </div>
      </div>

      {importError && <p className="app-header__import-error" role="alert" data-testid="import-error">{importError}</p>}
    </header>
  );
}
