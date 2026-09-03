/**
 * Flow JSON import/export (Phase 1, HLD §15 "Export" / §16 "Malformed Flow JSON
 * (on Import)" / §20 "Flow JSON Import/Export").
 *
 * `parseFlowJson` is the single validator for any Flow JSON coming from outside
 * the app — a user's imported file or a previous session's localStorage entry —
 * so both entry points share one rule instead of two. Validation checks the HLD's
 * structural shape (root present, each node has `id`/`type`, `children` is an
 * array if present, `props` is an object of strings if present) and — per Phase 1
 * "do not bypass the registry" — that every node `type` is actually known to the
 * registry, so an import can never smuggle in a type the rest of the app has no
 * definition for. Invalid imports are rejected outright (HLD §19: "no partial
 * import"), never silently repaired.
 *
 * Pure: no React, no Redux, no side effects (parsing/serializing text only).
 */

import type { FlowNode } from '../domain/types';
import { getRegistry } from '../registry';
import type { Registry } from '../registry';

/** Thrown by `parseFlowJson` when the input is not a valid Flow JSON document. */
export class FlowImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowImportError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNode(value: unknown, reg: Registry, path: string): FlowNode {
  if (!isPlainObject(value)) {
    throw new FlowImportError(`${path} must be an object.`);
  }

  const { id, type, props, children } = value;

  if (typeof id !== 'string' || id === '') {
    throw new FlowImportError(`${path}.id must be a non-empty string.`);
  }
  if (typeof type !== 'string' || type === '') {
    throw new FlowImportError(`${path}.type must be a non-empty string.`);
  }
  if (!reg.getBlock(type) && !reg.getFunction(type)) {
    throw new FlowImportError(`${path}.type "${type}" is not a known node type.`);
  }

  if (props !== undefined) {
    if (!isPlainObject(props)) {
      throw new FlowImportError(`${path}.props must be an object.`);
    }
    for (const [key, propValue] of Object.entries(props)) {
      if (typeof propValue !== 'string') {
        throw new FlowImportError(`${path}.props.${key} must be a string.`);
      }
    }
  }

  if (children !== undefined && !Array.isArray(children)) {
    throw new FlowImportError(`${path}.children must be an array.`);
  }

  const node: FlowNode = {
    id,
    type,
    props: (props as Record<string, string> | undefined) ?? {},
  };
  if (children !== undefined) {
    node.children = children.map((child, index) =>
      validateNode(child, reg, `${path}.children[${index}]`),
    );
  }
  return node;
}

/**
 * Parse and validate a Flow JSON document. `"null"` (an empty canvas, matching
 * `serializeFlow(null)`) is accepted and returns `null`; anything else must
 * satisfy `validateNode`. Throws `FlowImportError` (never a raw `SyntaxError` or
 * a partially-built tree) when the input is malformed.
 */
export function parseFlowJson(raw: string, reg: Registry = getRegistry()): FlowNode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FlowImportError('Not valid JSON.');
  }
  if (parsed === null) return null;
  return validateNode(parsed, reg, 'root');
}

/** Serialize the Flow JSON for export or persistence — pretty-printed, stable. */
export function serializeFlow(flow: FlowNode | null): string {
  return JSON.stringify(flow, null, 2);
}
