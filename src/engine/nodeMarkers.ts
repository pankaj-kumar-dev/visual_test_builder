/**
 * Node-id source markers (Phase 9, "compile-ready" export — mapping a
 * compiler diagnostic back to the flow node responsible for it).
 *
 * `engine/processFlow.ts`'s `GenMode.annotateNodeIds` mode appends a trailing
 * sentinel comment to the *first* line of each node's own generated output —
 * never a new line, only text appended to an existing one — so the annotated
 * code has exactly the same line count and line *positions* as the clean,
 * displayed code. That's what makes this safe: a diagnostic's line number,
 * computed against the annotated source, is valid against the clean source
 * too, so the compile checker never has to run twice or reconcile two
 * different line numberings.
 *
 * Pure string processing: no React, no Redux, no TypeScript compiler here.
 */

const MARKER_PATTERN = /\/\/@@node:([\w-]+)@@$/;
const TRAILING_MARKER = /[ \t]*\/\/@@node:[\w-]+@@$/;

/** Append `nodeId`'s marker to `code`'s first line only (its own opening line). */
export function markFirstLine(code: string, nodeId: string): string {
  const newlineIndex = code.indexOf('\n');
  const firstLine = newlineIndex === -1 ? code : code.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? '' : code.slice(newlineIndex);
  return `${firstLine} //@@node:${nodeId}@@${rest}`;
}

/** Strip every marker, restoring the plain, displayable code — line count and content otherwise unchanged. */
export function stripNodeMarkers(annotated: string): string {
  return annotated
    .split('\n')
    .map((line) => line.replace(TRAILING_MARKER, ''))
    .join('\n');
}

/** 1-indexed line number -> the node id marked on that exact line. */
export function parseNodeMarkers(annotated: string): Map<number, string> {
  const markers = new Map<number, string>();
  annotated.split('\n').forEach((line, index) => {
    const match = MARKER_PATTERN.exec(line);
    if (match) markers.set(index + 1, match[1]);
  });
  return markers;
}

/**
 * The node responsible for `line` (1-indexed): its own marker if it has one,
 * else the nearest marker on an earlier line — a multi-line node's body
 * (everything between its own opening line and the next marker) still
 * attributes to it. Returns null only when `line` precedes every marker
 * (should not happen for a non-empty annotated file, since line 1 is always
 * the root node's own marker).
 */
export function nodeIdForLine(markers: Map<number, string>, line: number): string | null {
  for (let current = line; current >= 1; current -= 1) {
    const id = markers.get(current);
    if (id) return id;
  }
  return null;
}
