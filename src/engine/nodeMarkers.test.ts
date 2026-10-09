/**
 * Node-id source marker unit tests (Phase 9, "compile-ready" export).
 */

import { describe, expect, it } from 'vitest';
import { markFirstLine, nodeIdForLine, parseNodeMarkers, stripNodeMarkers } from './nodeMarkers';
import { processFlowAnnotatedSpec, processFlowAsSpec } from './processFlow';
import type { FlowNode } from '../domain/types';

describe('markFirstLine', () => {
  it('appends the marker to a single-line string', () => {
    expect(markFirstLine("cy.visit('/login');", 'n1')).toBe("cy.visit('/login'); //@@node:n1@@");
  });

  it('appends the marker only to the first line of a multi-line string, leaving the rest untouched', () => {
    const code = "describe('Suite', () => {\n  it('works', () => {});\n});";
    expect(markFirstLine(code, 'n1')).toBe(
      "describe('Suite', () => { //@@node:n1@@\n  it('works', () => {});\n});",
    );
  });

  it('never changes the line count', () => {
    const code = 'a\nb\nc';
    expect(markFirstLine(code, 'n1').split('\n')).toHaveLength(3);
  });
});

describe('stripNodeMarkers / parseNodeMarkers round-trip', () => {
  it('strips markers back to the original, unmarked code', () => {
    const original = "describe('Suite', () => {\n  it('works', () => {});\n});";
    const marked = markFirstLine(original, 'n1');
    expect(stripNodeMarkers(marked)).toBe(original);
  });

  it('parses one entry per marked line, 1-indexed', () => {
    const marked = "a //@@node:n1@@\nb\nc //@@node:n3@@";
    expect(parseNodeMarkers(marked)).toEqual(new Map([[1, 'n1'], [3, 'n3']]));
  });
});

describe('nodeIdForLine', () => {
  const markers = new Map([[1, 'root'], [3, 'child']]);

  it('returns the exact marker on a marked line', () => {
    expect(nodeIdForLine(markers, 1)).toBe('root');
    expect(nodeIdForLine(markers, 3)).toBe('child');
  });

  it('falls back to the nearest earlier marker for an unmarked line', () => {
    expect(nodeIdForLine(markers, 2)).toBe('root');
    expect(nodeIdForLine(markers, 5)).toBe('child');
  });

  it('returns null when no marker precedes the line', () => {
    expect(nodeIdForLine(new Map([[5, 'x']]), 2)).toBeNull();
  });
});

describe('processFlowAnnotatedSpec', () => {
  function tree(): FlowNode {
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

  it('stripping the annotated output gives exactly processFlowAsSpec\'s output', () => {
    const annotated = processFlowAnnotatedSpec(tree());
    expect(stripNodeMarkers(annotated)).toBe(processFlowAsSpec(tree()));
  });

  it('every node gets its own marker on its own opening line, same line numbers as the clean code', () => {
    const annotated = processFlowAnnotatedSpec(tree());
    const clean = stripNodeMarkers(annotated);
    const markers = parseNodeMarkers(annotated);

    const cleanLines = clean.split('\n');
    expect(cleanLines[0]).toBe("describe('Suite', () => {");
    expect(cleanLines[1]).toBe("  it('works', () => {");
    expect(cleanLines[2]).toBe("    cy.get('#x').click();");

    expect(markers.get(1)).toBe('describe-1');
    expect(markers.get(2)).toBe('it-1');
    expect(markers.get(3)).toBe('click-1');
  });

  it('returns an empty string for a null flow', () => {
    expect(processFlowAnnotatedSpec(null)).toBe('');
  });
});
