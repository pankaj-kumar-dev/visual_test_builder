/**
 * Core domain types for the Visual Test Builder.
 *
 * Source of truth: HLD §10 (Data Model). The `codeTemplate` field is added to the
 * node definitions per HLD §12 (Code Generation) and §18.4 (assumption: the field
 * exists on each node definition; its name/location is an implementation detail).
 *
 * These types describe two distinct things:
 *   1. FlowNode              — a node in the user's flow tree (the Flow JSON).
 *   2. *NodeDef / PropDef    — static configuration loaded into the registry.
 */

/** The kind of input a property field renders as (HLD §10, PropDef.type). */
export type PropType = 'text' | 'dropdown';

/**
 * A single node in the flow tree — the Flow JSON (HLD §8, §10).
 * `props` holds command/structural property values keyed by PropDef.key.
 * `children` is present only on structural nodes.
 */
export interface FlowNode {
  id: string;
  type: string;
  props?: Record<string, string>;
  children?: FlowNode[];
}

/**
 * Definition of a single editable property field (HLD §10, function-props.json).
 * `options` is only meaningful when `type === 'dropdown'`.
 */
export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  required: boolean;
  options?: string[];
}

/**
 * Structural node definition, loaded from building-blocks.json (HLD §9, §10).
 * Structural nodes may contain children (constrained by `allowedChildren`) and
 * carry their own `props` inline.
 */
export interface StructuralNodeDef {
  type: string;
  label: string;
  category: 'structural';
  allowedChildren: string[];
  props: PropDef[];
  /** Cypress code template with {{key}} and {{children}} placeholders (HLD §12). */
  codeTemplate: string;
}

/**
 * Command node definition, loaded from functions.json (HLD §9, §10).
 * Command nodes are leaf nodes; their property schema lives in function-props.json.
 */
export interface CommandNodeDef {
  type: string;
  label: string;
  category: 'command';
  /** Cypress code template with {{key}} placeholders (HLD §12). */
  codeTemplate: string;
}

/**
 * Centralized application state (HLD §10, §14).
 * `generatedCode` is a derived value — a pure function of `flow` — not authoritative
 * state (HLD §14). It is held here only as the latest computed output.
 */
export interface AppState {
  flow: FlowNode | null;
  selectedNodeId: string | null;
  generatedCode: string;
}
