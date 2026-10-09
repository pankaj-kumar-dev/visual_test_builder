/**
 * Tree-row summary template unit tests (Phase 6, builder UX roadmap).
 */

import { describe, expect, it } from 'vitest';
import { renderSummaryTemplate } from './nodeSummary';

describe('renderSummaryTemplate', () => {
  it('fills every placeholder from props', () => {
    expect(
      renderSummaryTemplate('{{selector}} → "{{value}}"', {
        selector: '#email',
        value: 'user@example.com',
      }),
    ).toBe('#email → "user@example.com"');
  });

  it('trims prop values before substitution', () => {
    expect(renderSummaryTemplate('{{selector}}', { selector: '  #email  ' })).toBe('#email');
  });

  it('returns null when a placeholder has no usable value (missing key)', () => {
    expect(renderSummaryTemplate('{{selector}} → {{assertion}}', { selector: '#x' })).toBeNull();
  });

  it('returns null when a placeholder resolves to an empty/whitespace value', () => {
    expect(
      renderSummaryTemplate('{{selector}} → {{assertion}}', { selector: '#x', assertion: '   ' }),
    ).toBeNull();
  });

  it('returns null when props is undefined', () => {
    expect(renderSummaryTemplate('{{selector}}', undefined)).toBeNull();
  });

  it('handles a template with no placeholders at all', () => {
    expect(renderSummaryTemplate('fixed text', {})).toBe('fixed text');
  });

  it('never escapes special characters — this is display text, not code', () => {
    expect(renderSummaryTemplate('{{value}}', { value: "O'Brien" })).toBe("O'Brien");
  });
});
