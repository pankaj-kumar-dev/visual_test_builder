/**
 * Chain semantics unit tests (Phase 2, engine/chain.ts).
 *
 * Exercises the pure rule functions directly against the bundled registry —
 * the same rule the UI (drop validation) and the engine (generation) both build on.
 */

import { describe, expect, it } from 'vitest';
import { canContinueChain, getChainRole, validateChain } from './chain';
import { getRegistry } from '../registry';
import type { FlowNode } from '../domain/types';

const reg = getRegistry();

function leaf(type: string): FlowNode {
  return { id: `${type}-1`, type, props: {} };
}

describe('getChainRole', () => {
  it('returns "root" for get/contains', () => {
    expect(getChainRole('get', reg)).toBe('root');
    expect(getChainRole('contains', reg)).toBe('root');
  });

  it('returns "subject" for a continuation command', () => {
    expect(getChainRole('click', reg)).toBe('subject');
    expect(getChainRole('should', reg)).toBe('subject');
  });

  it('returns null for visit (not chainable)', () => {
    expect(getChainRole('visit', reg)).toBeNull();
  });

  it('returns null for an unknown/structural type', () => {
    expect(getChainRole('describe', reg)).toBeNull();
    expect(getChainRole('nonsense', reg)).toBeNull();
  });
});

describe('canContinueChain', () => {
  it('allows a root command to start an empty chain', () => {
    expect(canContinueChain([], 'get', reg)).toBe(true);
    expect(canContinueChain([], 'contains', reg)).toBe(true);
  });

  it('rejects a subject command as the first entry', () => {
    expect(canContinueChain([], 'click', reg)).toBe(false);
    expect(canContinueChain([], 'should', reg)).toBe(false);
  });

  it('rejects a non-chainable command at any position', () => {
    expect(canContinueChain([], 'visit', reg)).toBe(false);
    expect(canContinueChain([leaf('get')], 'visit', reg)).toBe(false);
  });

  it('allows a subject command after a root', () => {
    expect(canContinueChain([leaf('get')], 'click', reg)).toBe(true);
    expect(canContinueChain([leaf('get')], 'find', reg)).toBe(true);
  });

  it('rejects a second root command after the first', () => {
    expect(canContinueChain([leaf('get')], 'get', reg)).toBe(false);
    expect(canContinueChain([leaf('get')], 'contains', reg)).toBe(false);
  });

  it('allows a subject command after several subject commands', () => {
    expect(canContinueChain([leaf('get'), leaf('find'), leaf('first')], 'click', reg)).toBe(
      true,
    );
  });
});

describe('validateChain', () => {
  it('flags an empty chain', () => {
    expect(validateChain([], reg)).toEqual(['chain must contain at least one command']);
  });

  it('flags a chain that opens with a subject command', () => {
    const issues = validateChain([leaf('click')], reg);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/must begin with a root command/);
  });

  it('flags a non-chainable command inside an otherwise valid chain', () => {
    const issues = validateChain([leaf('get'), leaf('visit')], reg);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/"visit" cannot be used inside a chain/);
  });

  it('flags a second root command', () => {
    const issues = validateChain([leaf('get'), leaf('get')], reg);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/only one root command/);
  });

  it('flags get followed by visit specifically (Phase 2 brief example)', () => {
    const issues = validateChain([leaf('get'), leaf('visit')], reg);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('accepts a valid multi-step chain', () => {
    expect(validateChain([leaf('get'), leaf('find'), leaf('click'), leaf('should')], reg)).toEqual(
      [],
    );
  });

  it('accepts a valid two-step chain', () => {
    expect(validateChain([leaf('contains'), leaf('click')], reg)).toEqual([]);
  });

  it('accepts a single root command alone', () => {
    expect(validateChain([leaf('get')], reg)).toEqual([]);
  });
});
