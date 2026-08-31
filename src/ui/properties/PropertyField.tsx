/**
 * A single property input (HLD §6.5, §7, §16).
 *
 * Single responsibility: render one field (text or dropdown) from its PropDef and
 * report changes upward. It is controlled by the value passed in — no local copy
 * of state (HLD §14). `isMissing` is computed by the caller from the shared
 * `findUnresolvedNodes` result (Phase 2 UI: one detection, three surfaces — see
 * `app/hooks.ts`'s `useUnresolvedNodes`) rather than re-derived here, so this
 * field's warning state always agrees with the canvas highlight and the code
 * drawer's list for the same node.
 */

import type { ChangeEvent } from 'react';
import type { PropDef } from '../../domain/types';

interface PropertyFieldProps {
  def: PropDef;
  value: string;
  isMissing: boolean;
  /**
   * Rendered read-only because the node's context says so (`disabledWhen`). A
   * disabled field still applies conceptually, so it stays visible and still
   * participates in unresolved detection — unlike a hidden one (§21).
   */
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function PropertyField({
  def,
  value,
  isMissing,
  disabled = false,
  onChange,
}: PropertyFieldProps) {
  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    onChange(event.target.value);
  }

  return (
    <label className="property-field">
      <span className="property-field__label">
        {def.label}
        {def.required && <span className="property-field__required"> *</span>}
      </span>

      {def.type === 'dropdown' ? (
        <select
          className={`property-field__input${isMissing ? ' is-missing' : ''}`}
          data-testid={`prop-${def.key}`}
          value={value}
          disabled={disabled}
          onChange={handleChange}
        >
          <option value="">Select…</option>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className={`property-field__input${isMissing ? ' is-missing' : ''}`}
          data-testid={`prop-${def.key}`}
          value={value}
          disabled={disabled}
          onChange={handleChange}
        />
      )}

      {isMissing && (
        <span className="property-field__error" role="alert">
          <span aria-hidden="true">⚠ </span>
          This field is required.
        </span>
      )}
    </label>
  );
}
