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
 * Semantic facts about where a node sits in the flow, derived from the Flow JSON
 * plus registry metadata (never stored, never serialized — see engine/nodeContext.ts).
 * Property visibility rules are expressed against these flags rather than against
 * command names, so a new command becomes context-aware by configuration alone.
 */
export interface NodeContext {
  /** Type of the node's immediate parent, or null for the flow root. */
  parentType: string | null;
  /** Whether the parent composes its children into one Cypress subject expression. */
  isInsideChain: boolean;
  /** Whether an earlier node in the composition already produced this node's subject. */
  hasSubject: boolean;
}

/**
 * A contextual condition on a property field. Each present key is compared against
 * the matching `NodeContext` flag and all of them must hold (AND). An empty/absent
 * condition always holds, so a field with no condition behaves exactly as before.
 */
export type PropCondition = Partial<Pick<NodeContext, 'isInsideChain' | 'hasSubject'>>;

/**
 * A palette taxonomy category (config/categories.json).
 *
 * Configuration owns both the display label and the display order (array order),
 * so introducing a category — or reordering the taxonomy — never touches React.
 * `subgroups` is optional: a category with no subgroups lists its nodes directly.
 */
export interface CategoryDef {
  id: string;
  label: string;
  description?: string;
  subgroups?: SubgroupDef[];
}

/** A second-level bucket inside a category (config/categories.json). */
export interface SubgroupDef {
  id: string;
  label: string;
}

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
  /**
   * Show this field only when the node's context satisfies the condition (§20).
   * Use for a property that is genuinely irrelevant in the current context — e.g.
   * a subject command's `selector` once an earlier chain node supplied the subject.
   * A hidden field is not editable, so it is also excluded from unresolved-property
   * detection (engine/unresolved.ts) — one rule, both surfaces.
   */
  visibleWhen?: PropCondition;
  /**
   * Render this field read-only when the condition holds. Use when the property
   * still applies conceptually but cannot be edited here; it stays visible (and
   * therefore still counts toward unresolved detection).
   */
  disabledWhen?: PropCondition;
}

/**
 * Palette taxonomy placement, shared by structural and command definitions.
 * All fields are optional so a definition written before the taxonomy existed
 * still loads and still renders (it falls back to an "Other" category).
 */
export interface PaletteMetadata {
  /**
   * Top-level palette category id — matches a `CategoryDef.id` in categories.json
   * (e.g. "structural", "traversal", "action"). Presentational only: it never
   * affects code generation or drop validation.
   */
  group?: string;
  /** Optional second-level bucket id inside the category (e.g. "element", "mouse"). */
  subgroup?: string;
  /** One-line explanation, shown as the chip's tooltip and matched by palette search. */
  description?: string;
  /** Extra search synonyms (e.g. "dropdown" for select). Matched by palette search only. */
  keywords?: string[];
}

/**
 * Structural node definition, loaded from building-blocks.json (HLD §9, §10).
 * Structural nodes may contain children (constrained by `allowedChildren`) and
 * carry their own `props` inline.
 */
export interface StructuralNodeDef extends PaletteMetadata {
  type: string;
  label: string;
  category: 'structural';
  allowedChildren: string[];
  props: PropDef[];
  /** Cypress code template with {{key}} and {{children}} placeholders (HLD §12). */
  codeTemplate: string;
  /**
   * How this node's children compose (Phase 2, engine/chain.ts). Omitted (the
   * default) means the existing HLD §12 behavior: children are independent
   * statements joined by newlines and substituted into `{{children}}`. `'chain'`
   * means children compose into one Cypress subject expression instead
   * (`cy.get(x).find(y).click()`) — see the `chain` node in building-blocks.json.
   * `codeTemplate` is unused (empty string) for a chain-composition node; its
   * output is built entirely by `engine/processFlow.ts`'s chain generator.
   */
  childComposition?: 'chain';
}

/**
 * Command node definition, loaded from functions.json (HLD §9, §10).
 * Command nodes are leaf nodes; their property schema lives in function-props.json.
 */
export interface CommandNodeDef extends PaletteMetadata {
  type: string;
  label: string;
  category: 'command';
  /** Cypress code template with {{key}} placeholders (HLD §12). */
  codeTemplate: string;
  /**
   * This command's role inside a `chain` node (Phase 2, engine/chain.ts):
   *  - `'root'`    — may open a chain; creates the initial Cypress subject
   *                  (get, contains). Its chain-opening fragment is derived
   *                  generically from `codeTemplate` (stripped of the trailing
   *                  `;`) — no separate template needed.
   *  - `'subject'` — may continue a chain after a root (find, click, should, …).
   *                  Requires `chainTemplate`, its `.method(...)` suffix form.
   *  - omitted     — cannot appear inside a chain at all (e.g. `visit`, which
   *                  is navigation, not a subject operation).
   */
  chainRole?: 'root' | 'subject';
  /**
   * The `.method(...)` fragment used when this command continues a chain
   * (`chainRole: 'subject'` only). Deliberately separate from `codeTemplate`:
   * the standalone form re-anchors with its own `cy.get(selector)` (Phase 1
   * self-containment), while the chain form omits the selector entirely — the
   * subject already came from an earlier node in the chain.
   */
  chainTemplate?: string;
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
  /**
   * Whether the code drawer is open (Phase 2 UI). Pure UI state — not part of the
   * Flow JSON / test definition — but kept in the same Redux store as the rest of
   * the app's UI state (`selectedNodeId` already sets this precedent).
   */
  isCodeDrawerOpen: boolean;
  /**
   * Which tree nodes are collapsed on the canvas, keyed by stable node id (never
   * by index, so reordering can't transfer one node's state to another). Pure UI
   * state: it is deliberately *not* part of the Flow JSON, never reaches
   * `processFlow`, and cannot change the generated code. It lives in Redux rather
   * than in TreeNode because the code drawer has to expand a warning's ancestors
   * from outside the canvas.
   */
  collapsedNodeIds: Record<string, true>;
}
