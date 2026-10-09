/**
 * Syntax compile-check unit tests (Phase 9, "compile-ready" export).
 */

import { describe, expect, it } from 'vitest';
import { checkSpecSyntax } from './compileCheck';
import { processFlowAnnotatedSpec } from './processFlow';
import type { FlowNode } from '../domain/types';

function validFlow(): FlowNode {
  return {
    id: 'describe-1',
    type: 'describe',
    props: { label: 'Suite' },
    children: [
      {
        id: 'it-1',
        type: 'it',
        props: { label: 'works' },
        children: [{ id: 'click-1', type: 'click', props: { selector: '#x' } }],
      },
    ],
  };
}

describe('checkSpecSyntax', () => {
  it('reports no diagnostics for an ordinary valid flow', () => {
    const result = checkSpecSyntax(processFlowAnnotatedSpec(validFlow()));
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.cleanCode).toContain("describe('Suite'");
  });

  it('treats an empty annotated input (null flow) as syntactically fine', () => {
    const result = checkSpecSyntax('');
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('catches genuinely invalid JS in an `expression`-type field (intercept\'s raw stub response), the one place a prop is emitted unescaped', () => {
    const flow: FlowNode = {
      id: 'describe-1',
      type: 'describe',
      props: { label: 'API' },
      children: [
        {
          id: 'it-1',
          type: 'it',
          props: { label: 'stubs a broken response' },
          children: [
            {
              id: 'intercept-1',
              type: 'intercept',
              // Unclosed object literal — invalid JS, emitted verbatim since
              // `expression` fields are the one deliberate trust boundary.
              props: { url: '/api/x', stubResponse: '{ statusCode: 200, body: {' },
            },
          ],
        },
      ],
    };

    const result = checkSpecSyntax(processFlowAnnotatedSpec(flow));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].message.length).toBeGreaterThan(0);
    // The error is somewhere inside the intercept statement's own line, so it
    // must attribute back to the intercept node, not the describe/it wrapper.
    expect(result.diagnostics[0].nodeId).toBe('intercept-1');
  });

  it('the displayed cleanCode never contains a node marker', () => {
    const result = checkSpecSyntax(processFlowAnnotatedSpec(validFlow()));
    expect(result.cleanCode).not.toContain('@@node:');
  });
});
