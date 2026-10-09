/**
 * Try/Catch/Finally ("Try / Recover") unit tests (Phase 5 completion).
 *
 * Cypress commands are queued, not synchronous — a real `try { cy.get(...) }
 * catch (e) { ... }` never actually catches a Cypress command failure (the
 * failure surfaces later, off the call stack the `try` already returned
 * from), so this product deliberately does NOT generate plain JS
 * try/catch/finally around Cypress commands; see docs/HLD_Visual_Test_Builder.md
 * §12E for the full reasoning. Instead `try` compiles to Cypress's own
 * documented recovery mechanism, `cy.on('fail', (err) => { ...; return false
 * })`, registered *before* the attempted commands so it can actually observe
 * their failure, with the Finally body running unconditionally afterward —
 * reusing the pre-existing generic `slots` mechanism (`if`'s `then`/`else`),
 * not a new composition mode.
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import { findUnresolvedNodes } from './unresolved';
import type { FlowNode } from '../domain/types';

function slot(name: string, children: FlowNode[]): FlowNode {
  return { id: `slot-${name}`, type: 'slot', props: { name }, children };
}

function tryNode(children: FlowNode[]): FlowNode {
  return { id: 'try-1', type: 'try', props: {}, children };
}

function log(id: string, message: string): FlowNode {
  return { id, type: 'log', props: { message } };
}

describe('try/recover — code generation', () => {
  it('registers the fail handler before the attempted commands, and runs Finally unconditionally after', () => {
    const flow = tryNode([
      slot('try', [{ id: 'click-1', type: 'click', props: { selector: '.risky-button' } }]),
      slot('catch', [log('log-1', 'recovered')]),
      slot('finally', [log('log-2', 'cleanup')]),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.on('fail', (err) => {\n" +
        "  cy.log('recovered');\n" +
        '  return false;\n' +
        '});\n' +
        '{\n' +
        "  cy.get('.risky-button').click();\n" +
        '}\n' +
        '{\n' +
        "  cy.log('cleanup');\n" +
        '}',
    );
  });

  it('omits the Finally block entirely when that slot is empty', () => {
    const flow = tryNode([
      slot('try', [{ id: 'click-1', type: 'click', props: { selector: '.risky-button' } }]),
      slot('catch', [log('log-1', 'recovered')]),
      slot('finally', []),
    ]);
    expect(processFlow(flow)).toBe(
      "cy.on('fail', (err) => {\n" +
        "  cy.log('recovered');\n" +
        '  return false;\n' +
        '});\n' +
        '{\n' +
        "  cy.get('.risky-button').click();\n" +
        '}',
    );
  });

  it('omits Finally the same way when its slot wrapper is absent entirely (e.g. a hand-edited import)', () => {
    const flow = tryNode([
      slot('try', [{ id: 'click-1', type: 'click', props: { selector: '.risky-button' } }]),
      slot('catch', [log('log-1', 'recovered')]),
    ]);
    expect(processFlow(flow)).not.toContain('cleanup');
    expect(processFlow(flow)).toBe(
      "cy.on('fail', (err) => {\n" +
        "  cy.log('recovered');\n" +
        '  return false;\n' +
        '});\n' +
        '{\n' +
        "  cy.get('.risky-button').click();\n" +
        '}',
    );
  });

  it('an empty Catch body is a valid, silent recovery — the fail is swallowed and Finally still runs', () => {
    const flow = tryNode([slot('try', [log('log-1', 'attempt')]), slot('catch', []), slot('finally', [log('log-2', 'done')])]);
    const code = processFlow(flow);
    expect(code).toContain("cy.on('fail', (err) => {\n\n  return false;\n});");
    expect(code.trim().endsWith("cy.log('done');\n}")).toBe(true);
  });

  it('nests correctly inside an it/describe (indentation compounds one level per ancestor)', () => {
    const flow: FlowNode = {
      id: 'describe-1',
      type: 'describe',
      props: { label: 'Suite' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'recovers from a flaky click' },
          children: [
            tryNode([
              slot('try', [{ id: 'click-1', type: 'click', props: { selector: '.flaky' } }]),
              slot('catch', [log('log-1', 'recovered')]),
              slot('finally', []),
            ]),
          ],
        },
      ],
    };
    expect(processFlow(flow)).toBe(
      "describe('Suite', () => {\n" +
        "  it('recovers from a flaky click', () => {\n" +
        "    cy.on('fail', (err) => {\n" +
        "      cy.log('recovered');\n" +
        '      return false;\n' +
        '    });\n' +
        '    {\n' +
        "      cy.get('.flaky').click();\n" +
        '    }\n' +
        '  });\n' +
        '});',
    );
  });
});

describe('try/recover — validation (requiredSlots)', () => {
  it('flags Try and Catch as empty when both are empty (Finally stays optional)', () => {
    const flow = tryNode([slot('try', []), slot('catch', []), slot('finally', [])]);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'try-1',
        type: 'try',
        label: 'Recover',
        missing: ['"try" is empty', '"catch" is empty'],
        missingKeys: ['__slot:try', '__slot:catch'],
        severity: 'warning',
      },
    ]);
  });

  it('flags only Catch when Try has content but Catch does not', () => {
    const flow = tryNode([slot('try', [log('log-1', 'x')]), slot('catch', []), slot('finally', [])]);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'try-1',
        type: 'try',
        label: 'Recover',
        missing: ['"catch" is empty'],
        missingKeys: ['__slot:catch'],
        severity: 'warning',
      },
    ]);
  });

  it('is fully resolved once Try and Catch both have content, even with Finally left empty', () => {
    const flow = tryNode([slot('try', [log('log-1', 'x')]), slot('catch', [log('log-2', 'y')]), slot('finally', [])]);
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });
});
