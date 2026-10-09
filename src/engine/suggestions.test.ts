/**
 * Quick-add suggestion unit tests (Phase 7, builder UX roadmap).
 */

import { describe, expect, it } from 'vitest';
import { suggestedNextTypes } from './suggestions';

describe('suggestedNextTypes', () => {
  it('suggests a curated first step for an empty container, keyed by the container type', () => {
    expect(suggestedNextTypes('it', null)).toEqual(['visit', 'get', 'contains']);
  });

  it('suggests a curated next step after a given previous sibling type', () => {
    expect(suggestedNextTypes('it', 'visit')).toEqual(['get', 'contains', 'should']);
    expect(suggestedNextTypes('it', 'get')).toEqual(['click', 'type', 'should', 'find']);
  });

  it('returns an empty array for an unmapped container with no previous sibling', () => {
    expect(suggestedNextTypes('switch', null)).toEqual([]);
  });

  it('returns an empty array for an unmapped previous sibling type', () => {
    expect(suggestedNextTypes('it', 'log')).toEqual([]);
  });

  it('ignores the parent type once there is a previous sibling (the sibling drives the suggestion)', () => {
    expect(suggestedNextTypes('describe', 'visit')).toEqual(['get', 'contains', 'should']);
  });
});
