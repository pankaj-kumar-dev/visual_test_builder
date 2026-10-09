/**
 * "Save as reusable flow" name prompt (Phase 8, reusable-flow authoring).
 *
 * A tiny, centered modal shared by both entry points — a single row's
 * context menu (one node) and the multi-select bulk action panel (several
 * sibling nodes) — so there is exactly one name-entry UI, not two drifting
 * copies. It knows nothing about *which* nodes are being saved; the caller
 * supplies `nodeCount` purely for the confirmation copy and dispatches the
 * actual `SAVE_AS_REUSABLE_FLOW` action itself from `onSave`.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';

interface SaveAsFlowDialogProps {
  nodeCount: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export function SaveAsFlowDialog({ nodeCount, onSave, onCancel }: SaveAsFlowDialogProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div
      className="save-flow-dialog__backdrop"
      data-testid="save-flow-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form className="save-flow-dialog" data-testid="save-flow-dialog" onSubmit={handleSubmit}>
        <h2 className="save-flow-dialog__title">Save as reusable flow</h2>
        <p className="save-flow-dialog__subtitle">
          {nodeCount === 1 ? 'This step' : `These ${nodeCount} steps`} will be saved as a new,
          invocable flow in your library.
        </p>
        <label className="save-flow-dialog__label" htmlFor="save-flow-name">
          Flow name
        </label>
        <input
          ref={inputRef}
          id="save-flow-name"
          type="text"
          className="save-flow-dialog__input"
          data-testid="save-flow-name-input"
          placeholder="e.g. Login"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="save-flow-dialog__actions">
          <button type="button" className="save-flow-dialog__cancel" data-testid="save-flow-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="save-flow-dialog__save"
            data-testid="save-flow-submit"
            disabled={!name.trim()}
          >
            Save flow
          </button>
        </div>
      </form>
    </div>
  );
}
