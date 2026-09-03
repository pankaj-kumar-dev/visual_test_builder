/**
 * Application header / toolbar (Phase 2 UI; Phase 1: import/export).
 *
 * Single responsibility: the app title plus the toolbar actions that act on the
 * whole flow rather than a single node — the code-drawer toggle, and Flow JSON
 * export/import (HLD §15 "Export", §20 "Flow JSON Import/Export"). The drawer's
 * open/closed state lives in Redux (`state.isCodeDrawerOpen`) alongside the app's
 * other UI state, not as component-local state, so any part of the app can react
 * to it consistently.
 *
 * Export/import are client-side only (HLD §15: "a client-side file download, no
 * server involved") — a Blob URL for export, `FileReader` for import — and both
 * go through `state/flowIO.ts`'s shared serialize/validate so an imported file
 * is held to exactly the rule described there. An invalid import is rejected in
 * full (HLD §19) and reported inline rather than partially applied.
 */

import { useRef, useState, type ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { loadFlow, redo, setCodeDrawerOpen, undo } from '../state/builderSlice';
import { FlowImportError, parseFlowJson, serializeFlow } from '../state/flowIO';

export function Header() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.isCodeDrawerOpen);
  const flow = useAppSelector((state) => state.flow);
  const canUndo = useAppSelector((state) => state.history.past.length > 0);
  const canRedo = useAppSelector((state) => state.history.future.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    event.target.value = ''; // allow re-selecting the same file next time
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
      <span className="app-header__title">Visual Test Builder</span>

      <div className="app-header__actions">
        <button
          type="button"
          className="app-header__action"
          data-testid="undo-button"
          disabled={!canUndo}
          aria-label="Undo"
          onClick={() => dispatch(undo())}
        >
          Undo
        </button>
        <button
          type="button"
          className="app-header__action"
          data-testid="redo-button"
          disabled={!canRedo}
          aria-label="Redo"
          onClick={() => dispatch(redo())}
        >
          Redo
        </button>
        <button type="button" className="app-header__action" data-testid="export-flow" onClick={handleExport}>
          Export
        </button>
        <button
          type="button"
          className="app-header__action"
          data-testid="import-flow"
          onClick={handleImportClick}
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          data-testid="import-flow-input"
          className="app-header__file-input"
          onChange={handleFileSelected}
        />

        <button
          type="button"
          className={`app-header__code-toggle${isOpen ? ' is-active' : ''}`}
          data-testid="code-toggle"
          aria-pressed={isOpen}
          aria-label={isOpen ? 'Close generated code drawer' : 'Open generated code drawer'}
          onClick={() => dispatch(setCodeDrawerOpen(!isOpen))}
        >
          <span aria-hidden="true">{'</>'}</span> Code
        </button>
      </div>

      {importError && (
        <p className="app-header__import-error" role="alert" data-testid="import-error">
          {importError}
        </p>
      )}
    </header>
  );
}
