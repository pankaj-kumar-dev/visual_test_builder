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
 *
 * Phase 3: a field whose schema marks `acceptsReference` also renders a small
 * "insert reference" picker alongside the input — populated from
 * `availableReferences` (computed by the caller via
 * `engine/references.ts`'s `referencesInScope`, the exact same rule the
 * semantic validator uses), so the picker can never offer a name validation
 * would then reject. Picking one writes `@name` into the field through the
 * same `onChange` as typing — there is no separate reference-value state.
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
  /** Phase 3: reference names currently in scope, for the picker (§ above). */
  availableReferences?: string[];
  onChange: (value: string) => void;
}

export function PropertyField({
  def,
  value,
  isMissing,
  disabled = false,
  availableReferences = [],
  onChange,
}: PropertyFieldProps) {
  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    onChange(event.target.value);
  }

  function handlePickReference(event: ChangeEvent<HTMLSelectElement>) {
    const name = event.target.value;
    if (name) onChange(`@${name}`);
    event.target.value = ''; // picker itself has no persistent selection — it's an insert action
  }

  // Phase 7: a `selector`-type field's convention picker — a typing shortcut,
  // never a second stored value. It only prefills when the field is still
  // empty (never overwrites what the user already typed), and it has no
  // persistent selection of its own, the same "insert action, not a value"
  // shape as the reference picker above.
  function handlePickSelectorKind(event: ChangeEvent<HTMLSelectElement>) {
    const prefix = event.target.value;
    event.target.value = '';
    if (!prefix || value.trim() !== '') return;
    onChange(prefix);
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
          type={def.type === 'number' ? 'number' : 'text'}
          className={`property-field__input${isMissing ? ' is-missing' : ''}`}
          data-testid={`prop-${def.key}`}
          value={value}
          disabled={disabled}
          onChange={handleChange}
        />
      )}

      {def.type === 'selector' && (
        <select
          className="property-field__selector-kind"
          data-testid={`prop-${def.key}-selector-kind`}
          aria-label={`Selector convention for ${def.label}`}
          value=""
          disabled={disabled}
          onChange={handlePickSelectorKind}
        >
          <option value="">Pick a convention…</option>
          <option value="#">id (#)</option>
          <option value=".">class (.)</option>
          <option value="[data-testid=]">data-testid</option>
          <option value="[data-cy=]">data-cy</option>
        </select>
      )}

      {def.acceptsReference && availableReferences.length > 0 && (
        <select
          className="property-field__reference-picker"
          data-testid={`prop-${def.key}-reference-picker`}
          aria-label={`Insert a reference into ${def.label}`}
          value=""
          disabled={disabled}
          onChange={handlePickReference}
        >
          <option value="">Insert reference…</option>
          {availableReferences.map((name) => (
            <option key={name} value={name}>
              @{name}
            </option>
          ))}
        </select>
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
