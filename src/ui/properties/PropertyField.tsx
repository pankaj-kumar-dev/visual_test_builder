/**
 * A single property input (HLD §6.5, §7, §16).
 *
 * Single responsibility: render one field (text or dropdown) from its PropDef and
 * report changes upward. It is controlled by the value passed in — no local copy
 * of state (HLD §14). Required fields are marked, and a required field left empty
 * shows an inline indicator (HLD §16).
 */

import type { ChangeEvent } from 'react';
import type { PropDef } from '../../domain/types';

interface PropertyFieldProps {
  def: PropDef;
  value: string;
  onChange: (value: string) => void;
}

export function PropertyField({ def, value, onChange }: PropertyFieldProps) {
  const isMissing = def.required && value.trim() === '';

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
          onChange={handleChange}
        />
      )}

      {isMissing && (
        <span className="property-field__error">This field is required.</span>
      )}
    </label>
  );
}
