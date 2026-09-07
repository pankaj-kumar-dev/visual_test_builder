/**
 * "Retry" unit tests (Phase 5D).
 *
 * Design decision, documented in full in docs/HLD_Visual_Test_Builder.md §12E:
 * a generic "Retry N times" / "Repeat Until" structural node is REJECTED as
 * semantically unsound for this generator — Cypress has no built-in bounded
 * command-repetition primitive, and this template-based, non-recursive
 * generator cannot correctly express the recursive `.then()`-polling pattern
 * real Cypress retry recipes require without inventing a whole function-
 * definition mechanism (out of scope, and a genuine architecture change).
 *
 * What Cypress *does* provide, and what this phase implements instead, is its
 * own built-in query/assertion retry-until-timeout behavior, tunable per
 * command via a `{ timeout }` options object — real Cypress: `cy.get(selector,
 * { timeout: 10000 })` keeps retrying the query (and any assertion chained
 * onto it) until it succeeds or the given timeout elapses. That is "command
 * retry configuration" / "retrying an assertion" done the Cypress-native way:
 * a plain optional prop on `get`/`contains`/`find`, using the exact same
 * `[[key: ...]]` optional-segment mechanism every other optional argument
 * already uses. No engine change, no new node.
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import type { FlowNode } from '../domain/types';

describe('get/contains/find — optional timeout (Cypress-native retry configuration)', () => {
  it('get with no timeout is unchanged from before this phase', () => {
    const flow: FlowNode = { id: 'get-1', type: 'get', props: { selector: '.el' } };
    expect(processFlow(flow)).toBe("cy.get('.el');");
  });

  it('get with a timeout emits the { timeout } options object', () => {
    const flow: FlowNode = { id: 'get-1', type: 'get', props: { selector: '.el', timeout: '8000' } };
    expect(processFlow(flow)).toBe("cy.get('.el', { timeout: 8000 });");
  });

  it('an invalid (non-numeric) timeout is treated as absent — generator safety, same rule as every other number field', () => {
    const flow: FlowNode = { id: 'get-1', type: 'get', props: { selector: '.el', timeout: 'soon' } };
    expect(processFlow(flow)).toBe("cy.get('.el');");
  });

  it('contains with a timeout, no selector scope', () => {
    const flow: FlowNode = { id: 'contains-1', type: 'contains', props: { text: 'Save', timeout: '5000' } };
    expect(processFlow(flow)).toBe("cy.contains('Save', { timeout: 5000 });");
  });

  it('contains with both a selector scope and a timeout', () => {
    const flow: FlowNode = {
      id: 'contains-1',
      type: 'contains',
      props: { text: 'Save', selector: '.modal', timeout: '5000' },
    };
    expect(processFlow(flow)).toBe("cy.get('.modal').contains('Save', { timeout: 5000 });");
  });

  it('find with a timeout, standalone', () => {
    const flow: FlowNode = {
      id: 'find-1',
      type: 'find',
      props: { selector: '.grid', target: '.row', timeout: '3000' },
    };
    expect(processFlow(flow)).toBe("cy.get('.grid').find('.row', { timeout: 3000 });");
  });

  it('find with a timeout, chained after a preceding get (no selector needed)', () => {
    const flow: FlowNode = {
      id: 'chain-1',
      type: 'chain',
      props: {},
      children: [
        { id: 'get-1', type: 'get', props: { selector: '.grid' } },
        { id: 'find-1', type: 'find', props: { target: '.row', timeout: '3000' } },
      ],
    };
    expect(processFlow(flow)).toBe("cy.get('.grid').find('.row', { timeout: 3000 });");
  });
});
