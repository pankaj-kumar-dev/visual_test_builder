/**
 * Bundled test template validation (Phase 8, builder UX roadmap). Every
 * starter template must be immediately generate-able and issue-free the
 * moment it's loaded — a user picking "Login Test" should never land on a
 * flow that's already flagged as broken.
 */

import { describe, expect, it } from 'vitest';
import { getTestTemplates } from './testTemplatesConfig';
import { findSemanticIssues } from '../engine/references';
import { findUnresolvedNodes } from '../engine/unresolved';
import { processFlow } from '../engine/processFlow';

describe('bundled test templates', () => {
  const templates = getTestTemplates();

  it('ships at least a few starter templates', () => {
    expect(templates.length).toBeGreaterThanOrEqual(3);
  });

  it('has a unique id and non-empty name/description for every template', () => {
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of templates) {
      expect(template.name.trim()).not.toBe('');
      expect(template.description.trim()).not.toBe('');
    }
  });

  it.each(getTestTemplates().map((t) => [t.id, t] as const))(
    '%s: has no unresolved properties or semantic issues, and generates non-empty code',
    (_id, template) => {
      expect(findUnresolvedNodes(template.flow)).toEqual([]);
      expect(findSemanticIssues(template.flow)).toEqual([]);
      expect(processFlow(template.flow).length).toBeGreaterThan(0);
    },
  );
});
