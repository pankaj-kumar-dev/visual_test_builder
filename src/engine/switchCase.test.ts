/**
 * Switch/Case/Default unit tests (Phase 5 completion).
 *
 * `switch` uses the pre-existing *ordinary* child composition (no new
 * composition mode) plus the new, generic `childCardinality` metadata
 * (engine/unresolved.ts) — not the `slots` mechanism, since a switch has an
 * *unbounded* number of `case` children, which a fixed-name slot array can't
 * express. `case`/`default` are ordinary structural nodes whose own
 * `{{children}}` is their branch body — the exact same generic mechanism
 * every other structural node already uses, so no new generator branch was
 * needed for any of this.
 */

import { describe, expect, it } from 'vitest';
import { processFlow } from './processFlow';
import { findUnresolvedNodes } from './unresolved';
import type { FlowNode } from '../domain/types';

function log(id: string, message: string): FlowNode {
  return { id, type: 'log', props: { message } };
}

function switchNode(id: string, expression: string, children: FlowNode[]): FlowNode {
  return { id, type: 'switch', props: { expression }, children };
}

function caseNode(id: string, value: string, children: FlowNode[]): FlowNode {
  return { id, type: 'case', props: { value }, children };
}

function defaultNode(id: string, children: FlowNode[]): FlowNode {
  return { id, type: 'default', props: {}, children };
}

describe('switch/case/default — code generation', () => {
  it('a single case with no default', () => {
    const flow = switchNode('sw-1', 'role', [caseNode('case-1', "'admin'", [log('log-1', 'admin path')])]);
    expect(processFlow(flow)).toBe(
      "switch (role) {\n" + "  case 'admin':\n" + "    cy.log('admin path');\n" + '    break;\n' + '}',
    );
  });

  it('multiple cases plus a default, preserving source order', () => {
    const flow = switchNode('sw-1', 'role', [
      caseNode('case-1', "'admin'", [log('log-1', 'admin path')]),
      caseNode('case-2', "'user'", [log('log-2', 'user path')]),
      defaultNode('default-1', [log('log-3', 'other')]),
    ]);
    expect(processFlow(flow)).toBe(
      'switch (role) {\n' +
        "  case 'admin':\n" +
        "    cy.log('admin path');\n" +
        '    break;\n' +
        "  case 'user':\n" +
        "    cy.log('user path');\n" +
        '    break;\n' +
        '  default:\n' +
        "    cy.log('other');\n" +
        '    break;\n' +
        '}',
    );
  });

  it('an empty case body still generates syntactically valid JavaScript', () => {
    const flow = switchNode('sw-1', 'x', [caseNode('case-1', '1', [])]);
    expect(processFlow(flow)).toBe('switch (x) {\n' + '  case 1:\n' + '\n' + '    break;\n' + '}');
  });

  it('a numeric case value (raw expression, unquoted)', () => {
    const flow = switchNode('sw-1', 'count', [caseNode('case-1', '0', [log('log-1', 'zero')])]);
    expect(processFlow(flow)).toContain('case 0:');
  });

  it('a case containing nested commands, including a chain', () => {
    const flow = switchNode('sw-1', 'mode', [
      caseNode('case-1', "'grid'", [
        {
          id: 'chain-1',
          type: 'chain',
          props: {},
          children: [
            { id: 'get-1', type: 'get', props: { selector: '.grid' } },
            { id: 'click-1', type: 'click', props: {} },
          ],
        },
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "switch (mode) {\n" +
        "  case 'grid':\n" +
        "    cy.get('.grid').click();\n" +
        '    break;\n' +
        '}',
    );
  });

  it('a case containing a nested if (control-flow composes with control-flow)', () => {
    const flow = switchNode('sw-1', 'mode', [
      caseNode('case-1', "'a'", [
        {
          id: 'if-1',
          type: 'if',
          props: { condition: 'ready' },
          children: [
            { id: 'slot-then', type: 'slot', props: { name: 'then' }, children: [log('log-1', 'go')] },
            { id: 'slot-else', type: 'slot', props: { name: 'else' }, children: [] },
          ],
        },
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "switch (mode) {\n" +
        "  case 'a':\n" +
        '    if (ready) {\n' +
        "      cy.log('go');\n" +
        '    }\n' +
        '    break;\n' +
        '}',
    );
  });

  it('a case containing a nested forEach (control-flow composes with iteration)', () => {
    const flow = switchNode('sw-1', 'mode', [
      caseNode('case-1', "'a'", [
        {
          id: 'foreach-1',
          type: 'forEach',
          props: { source: 'items', itemAs: 'item' },
          children: [log('log-1', 'x')],
        },
      ]),
    ]);
    expect(processFlow(flow)).toBe(
      "switch (mode) {\n" +
        "  case 'a':\n" +
        '    items.forEach((item) => {\n' +
        "      cy.log('x');\n" +
        '    });\n' +
        '    break;\n' +
        '}',
    );
  });
});

describe('switch/case/default — validation (childCardinality)', () => {
  it('flags a switch with zero cases', () => {
    const flow = switchNode('sw-1', 'x', []);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'sw-1',
        type: 'switch',
        label: 'Switch',
        missing: ['At least 1 Case is required'],
        missingKeys: ['__cardinality:case'],
      },
    ]);
  });

  it('does not flag a switch with exactly one case and no default', () => {
    const flow = switchNode('sw-1', 'x', [caseNode('case-1', '1', [log('log-1', 'x')])]);
    expect(findUnresolvedNodes(flow)).toEqual([]);
  });

  it('flags a switch with two default nodes (at most one is allowed)', () => {
    const flow = switchNode('sw-1', 'x', [
      caseNode('case-1', '1', [log('log-1', 'x')]),
      defaultNode('default-1', [log('log-2', 'a')]),
      defaultNode('default-2', [log('log-3', 'b')]),
    ]);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      {
        id: 'sw-1',
        type: 'switch',
        label: 'Switch',
        missing: ['At most 1 Default is allowed'],
        missingKeys: ['__cardinality:default'],
      },
    ]);
  });

  it('flags both violations at once (zero cases, two defaults)', () => {
    const flow = switchNode('sw-1', 'x', [
      defaultNode('default-1', [log('log-1', 'a')]),
      defaultNode('default-2', [log('log-2', 'b')]),
    ]);
    const result = findUnresolvedNodes(flow);
    expect(result[0].missing).toEqual(['At least 1 Case is required', 'At most 1 Default is allowed']);
  });

  it('a missing switch expression is still flagged by the ordinary required-prop rule (unchanged)', () => {
    const flow = switchNode('sw-1', '', [caseNode('case-1', '1', [log('log-1', 'x')])]);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      { id: 'sw-1', type: 'switch', label: 'Switch', missing: ['Expression'], missingKeys: ['expression'] },
    ]);
  });

  it('a missing case value is flagged the same generic way', () => {
    const flow = switchNode('sw-1', 'x', [caseNode('case-1', '', [log('log-1', 'x')])]);
    const result = findUnresolvedNodes(flow);
    expect(result).toEqual([
      { id: 'case-1', type: 'case', label: 'Switch Case', missing: ['Case Value (raw JS, e.g. \'admin\' or 2)'], missingKeys: ['value'] },
    ]);
  });
});
