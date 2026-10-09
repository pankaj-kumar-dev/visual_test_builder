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

/**
 * The kind of input a property field renders as (HLD §10, PropDef.type).
 *  - `binding`    — Phase 2: a callback-bound identifier (e.g. `then`'s "bind
 *                   result as"). Rendered as text; validated as a bare JS
 *                   identifier and emitted unquoted, never escaped as a string
 *                   (engine/propValue.ts's `isValidBindingName`/`bindingToken`).
 *  - `expression` — Phase 2: a raw, trusted JS expression (e.g. `wrap`'s
 *                   subject, `$row`). Rendered as text; emitted verbatim,
 *                   unquoted and unescaped — the one deliberate trust boundary
 *                   in the generator, since arbitrary JS can't be validated
 *                   here. Use only where Cypress itself expects an expression,
 *                   not a string literal.
 *  - `reference-name` — Phase 3: the name a node *produces* as a Cypress alias
 *                   (`as`'s `name`, `.as('{{name}}')`). Rendered as text;
 *                   validated as a bare identifier like `binding` (reused
 *                   validator — same shape rule, deliberately different type
 *                   tag: a reference is flow-wide-by-name and ordered, a
 *                   binding is closure-scoped, engine/references.ts vs
 *                   engine/nodeContext.ts must never be collapsed into one
 *                   mechanism), but *emitted quoted* like ordinary text
 *                   (`.as('name')` takes a string, not a bare identifier).
 *                   Consuming a reference is a plain `text` field whose value
 *                   happens to start with `@` — the same convention Cypress
 *                   itself uses at runtime (`cy.get('@alias')`) — recognized
 *                   by engine/references.ts, not a separate type; see
 *                   `PropDef.acceptsReference` for the picker-UI hint.
 *  - `selector`   — Phase 7: a CSS-selector-shaped `text` field with a small
 *                   convention picker (CSS / id / class / data-testid) beside
 *                   the input (`ui/properties/PropertyField.tsx`). The picker
 *                   only ever prefills the field when it's still empty — it
 *                   is a typing shortcut, not a second stored value — so this
 *                   is otherwise byte-for-byte identical to `text` everywhere
 *                   else: generation (`engine/processFlow.ts`'s `resolveProps`)
 *                   and validation (`engine/propValue.ts`'s `isValuePresent`)
 *                   both already treat any type they don't special-case as
 *                   plain text, so neither needed a change for this variant.
 */
export type PropType =
  | 'text'
  | 'dropdown'
  | 'number'
  | 'binding'
  | 'expression'
  | 'reference-name'
  | 'selector';

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
  /**
   * Callback-bound identifiers visible at this node (Phase 2), nearest-binder
   * last. Derived by walking every ancestor block (`childComposition: 'block'`)
   * and resolving its `bindsParameters` against its own props — the same rule
   * `engine/processFlow.ts` uses to build the actual callback signature
   * (`engine/propValue.ts`'s `resolveBindingNames`), so a name can never appear
   * "in scope" here without also appearing in the generated callback, or vice
   * versa. Distinct from an alias/reference (Phase 3): a binding exists only
   * for the lexical extent of its callback body, never resolved by name lookup
   * across the whole flow.
   */
  bindingsInScope: string[];
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
  /**
   * Phase 3 UI hint: this `text` field may hold a reference consumption
   * (`@name`) instead of a literal value (e.g. `get`'s `selector`, real
   * Cypress: `cy.get('@alias')` works exactly like `cy.get('.css-selector')`).
   * Purely presentational — it tells the property editor to also offer a
   * reference picker — and never changes generation (a `@name` string is
   * already emitted correctly by the existing `text` substitution) or
   * structural validation. Semantic validation (engine/references.ts) checks
   * *every* prop value for the `@` convention regardless of this flag; the
   * flag only decides whether the picker UI appears.
   */
  acceptsReference?: boolean;
  /**
   * Phase 7: render this field inside the property editor's collapsed
   * "Advanced" section instead of the primary list — for a field that's
   * genuinely secondary (a retry timeout, an assertion's `have.length`
   * count), not one most users need to see by default. Presentational only,
   * exactly like `PaletteMetadata.common`'s opposite number: an advanced
   * field is otherwise completely ordinary — ungated required fields are
   * never marked advanced in this registry, but if one ever were, the
   * section still renders its own value/required state and participates in
   * unresolved detection exactly like any other field, so it could never be
   * silently hidden while actually missing.
   */
  advanced?: boolean;
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
  /**
   * Phase 5: exclude this node from the palette entirely (`ui/palette/paletteModel.ts`'s
   * `collectPaletteNodes`) — for a node that is only ever created *by* the app
   * (the generic `slot` wrapper, engine/slots.ts), never dragged in by a user.
   * It remains a fully valid, addressable registry type otherwise; this hides it
   * from one specific UI surface, nothing else.
   */
  hidden?: boolean;
  /**
   * Phase 6: surface this node in the palette's pinned "Common" section, in
   * addition to its ordinary category/subgroup placement — a curated
   * shortlist of the handful of commands most tests reach for first (visit,
   * get, click, type, …), so a new user isn't required to learn the full
   * taxonomy before building a first flow. Presentational only, like the rest
   * of `PaletteMetadata`: a node tagged `common` is otherwise identical, drags
   * and validates exactly the same way whether picked from "Common" or from
   * its own category.
   */
  common?: boolean;
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
  /**
   * Cypress code template with {{key}}, {{children}} and (block nodes only)
   * {{params}} placeholders (HLD §12). Optional for a `chainRole: 'subject'`
   * node with a `chainTemplate` — same Phase 1 "template duplication" rule as
   * `CommandNodeDef.codeTemplate` (`engine/chain.ts`'s `deriveStandaloneTemplate`):
   * its standalone form is always `cy.get('{{selector}}')` + `chainTemplate`.
   */
  codeTemplate?: string;
  /**
   * How this node's children compose. Omitted (the default) means the existing
   * HLD §12 behavior: children are independent statements joined by newlines
   * and substituted into `{{children}}`. `'chain'` (Phase 2, engine/chain.ts)
   * means children compose into one Cypress subject expression instead
   * (`cy.get(x).find(y).click()`) — see the `chain` node in building-blocks.json;
   * `codeTemplate` is unused (empty string) for it, since its output is built
   * entirely by `engine/processFlow.ts`'s chain generator. `'block'` (Phase 2)
   * marks a node whose children are an ordinary nested statement body owned by
   * a Cypress callback (`within`, `then`, `each`, `session`) — generation-wise
   * it is handled exactly like the default (children substituted into
   * `{{children}}`); the marker exists for validation (an empty block is
   * flagged, engine/unresolved.ts) and the tree UI (§24), not for the generator,
   * which never branches on it. `'reuse'` (Phase 5, engine/reusableFlows.ts)
   * marks a *reusable-flow invocation*: its output is not template substitution
   * at all but a generation-time expansion of a stored `ReusableFlowDef`'s body
   * (with its parameters substituted) through the ordinary generator — see
   * `engine/processFlow.ts`'s single `childComposition === 'reuse'` dispatch,
   * the same shape as the pre-existing `'chain'` dispatch: one generic
   * composition mode, not a per-command branch.
   */
  childComposition?: 'chain' | 'block' | 'reuse';
  /**
   * Phase 5: named child slots for **generic multi-slot composition** (`if`/
   * `else`, and any future multi-slot construct). When present, this node's
   * children are not a single ordinary list but one `slot` wrapper node
   * (registry type `"slot"`, engine/slots.ts) per declared name, each holding
   * its own ordinary children. `codeTemplate` references each slot's contents
   * with a `{{slot:name}}` token (engine/processFlow.ts), and an *optional*
   * slot's surrounding text is wrapped in `[[slot:name: ...]]` — the same
   * optional-segment mechanism `[[key: ...]]` already uses for an empty prop,
   * generalized to "this slot has no content" (engine/processFlow.ts's
   * `resolveProps`). A node with no `slots` never has a `slot`-typed child;
   * the reverse is checked too (engine/unresolved.ts) so a `slot` node can
   * never end up misplaced under a non-declaring parent or under the wrong
   * slot name — one generic structural rule, not a per-construct validator.
   */
  slots?: string[];
  /**
   * Phase 5: render this node's *displayed* label from one of its own prop
   * values (title-cased) instead of the registry's static `label` — used by
   * the single generic `slot` node so a `then`/`else` row reads as "Then"/
   * "Else" in the tree rather than an undifferentiated "Slot" (engine/slots.ts
   * defines the one slot type; this is a display hint only, never consulted by
   * generation or validation). Omitted for every node with a fixed label.
   */
  labelFromProp?: string;
  /**
   * This node's role inside a `chain` node (Phase 2, engine/chain.ts) — same
   * contract as `CommandNodeDef.chainRole`. A block node is always `'subject'`
   * when present (a block always needs a preceding subject to scope/operate
   * on) or omitted entirely when the node is never chain-participable
   * (`session`, which is always a standalone root-level statement).
   */
  chainRole?: 'root' | 'subject';
  /**
   * The `.method(...)` fragment used when this node continues a chain
   * (`chainRole: 'subject'` only) — same contract as `CommandNodeDef.chainTemplate`.
   * For a block node this typically embeds both `{{children}}` and `{{params}}`,
   * e.g. `.within(() => {\n{{children}}\n})` or `.then(({{params}}) => {\n{{children}}\n})`.
   */
  chainTemplate?: string;
  /**
   * Phase 2 callback bindings: the parameter list of this block's callback,
   * outermost first. Each entry is either a literal token emitted as-is (e.g.
   * `each`'s fixed `"$el"`, `"index"`) or a `"{{key}}"` reference to one of this
   * node's own `props` (e.g. `then`'s `"{{as}}"`, a user-editable `binding`
   * field) — resolved by `engine/propValue.ts`'s `resolveBindingNames`, the one
   * function both the generator (building `{{params}}`) and `NodeContext`
   * (deriving `bindingsInScope` for descendants) call, so the two can never
   * disagree about what a block actually binds. An entry that resolves to no
   * usable value (an empty optional `{{key}}`) is dropped from the signature
   * entirely rather than leaving a hole.
   */
  bindsParameters?: string[];
  /**
   * Phase 3: this node defines a *reference test-scope boundary* — a
   * container whose direct `it`/hook children each get an isolated local
   * reference scope, sharing only what the container's hooks produce
   * (`describe`, real Cypress). Metadata-driven so `engine/references.ts`
   * never hardcodes `node.type === 'describe'`; a future structural container
   * with the same scoping behavior becomes one automatically.
   */
  referenceScopeBoundary?: boolean;
  /**
   * Phase 3: this node's produced references become visible to every sibling
   * inside its `referenceScopeBoundary` parent — real Cypress: a `beforeAll`/
   * `beforeEach` hook's aliases are available in every `it` in the suite,
   * regardless of declaration order, because the hook always runs first.
   * `afterAll`/`afterEach` omit this — they run *after* every test, so their
   * aliases can't have been available during it.
   */
  producesReferencesForSiblings?: boolean;
  /**
   * Phase 5 completion: which of this node's *declared* `slots` must hold at
   * least one child to be meaningful — e.g. `try`'s `try`/`catch` (a recovery
   * construct with nothing to attempt, or nothing to do on failure, is
   * pointless), while `finally` stays optional. Same "visible warning, not a
   * hard generation error" rule `childComposition: 'block'`'s empty-body check
   * already uses (engine/unresolved.ts) — reused generically here for any
   * *named* slot rather than an unnamed block body, via the same
   * `slotHasContent` (engine/slots.ts) the generator itself reads. Omitted
   * (the default) means no declared slot is required — `if`'s `then`/`else`
   * keep their original Phase 5 behavior unchanged.
   */
  requiredSlots?: string[];
  /**
   * Phase 5 completion: bounds on how many *ordinary* children of a given
   * `type` this node may have — distinct from `slots` (which grows one fixed
   * wrapper per declared name): this instead constrains an unbounded,
   * ordinarily-composed child list, e.g. `switch` needing at least one `case`
   * and at most one `default`, in any order, with no fixed count. Keyed by
   * the child's registry `type`; `label` is the human-readable name used in
   * the reported message (falls back to the type string). Generic over any
   * future construct with the same "N of this child type" shape —
   * engine/unresolved.ts's cardinality check is the one place that
   * interprets it, never a `node.type === 'switch'` check.
   */
  childCardinality?: Record<string, { min?: number; max?: number; label?: string }>;
  /**
   * Phase 6: a curated, human-readable one-line summary for the tree row —
   * `{{key}}` placeholders filled from this node's own `props`
   * (`engine/nodeSummary.ts`'s `renderSummaryTemplate`), e.g. Type's
   * `"{{selector}} → \"{{value}}\""` reading as `#email → "user@example.com"`
   * instead of just `#email`. Display-only: never consulted by generation or
   * validation, and never required — when absent, or when a placeholder has
   * no usable value, `TreeNode.tsx` falls back to its existing generic
   * "first configured prop" summary, so this is purely an opt-in upgrade for
   * a handful of the most-used commands.
   */
  summaryTemplate?: string;
}

/**
 * Command node definition, loaded from functions.json (HLD §9, §10).
 * Command nodes are leaf nodes; their property schema lives in function-props.json.
 */
export interface CommandNodeDef extends PaletteMetadata {
  type: string;
  label: string;
  category: 'command';
  /**
   * Cypress code template with {{key}} placeholders (HLD §12). Optional for a
   * `chainRole: 'subject'` command: its standalone form is always
   * `cy.get('{{selector}}')` followed by `chainTemplate` (Phase 1, "template
   * duplication" — engine/chain.ts's `deriveStandaloneTemplate`), so authoring
   * both would just repeat the same text. Provide an explicit `codeTemplate`
   * only when the standalone form must differ from that derivation.
   */
  codeTemplate?: string;
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
   * (`chainRole: 'subject'` only). Also the source `codeTemplate` is derived
   * from when the command omits its own (see above).
   */
  chainTemplate?: string;
  /**
   * Phase 4: this command consumes a reference whose whole point is that
   * *something ran in between* the reference's producer and this use — real
   * Cypress: `cy.wait('@alias')` after `cy.intercept(...).as('alias')` is
   * meaningless unless a request-triggering action (`cy.visit`, `cy.click`,
   * …) happened in between, or the wait will simply hang waiting for a call
   * that was never made. Set only on `waitAlias`. Checked generically by
   * `engine/references.ts` against any node whose registry `group` is
   * `'action'` or `'browser'` (the existing taxonomy already used everywhere
   * else) — never a `node.type` name check, and never a second alias system:
   * the alias itself is the exact same Phase 3 reference produced by `as`.
   */
  requiresTriggerBeforeUse?: boolean;
  /** Phase 6: see `StructuralNodeDef.summaryTemplate` — identical contract, a
   * command-side property purely because `CommandNodeDef` and
   * `StructuralNodeDef` are separate interfaces, not a different mechanism. */
  summaryTemplate?: string;
}

/**
 * Phase 5: a reusable flow's declared parameter — the definition-side half of
 * "reusable flow parameter/argument" (kept a distinct concept from the
 * *argument*, the invocation-side value bound to it: `FlowNode.props[key]` on
 * the `flowInvocation` node). Deliberately reuses `PropType`/`required`/
 * `options` — the exact same shape a `PropDef` already has — so an invocation's
 * dynamic property-editor schema (engine/reusableFlows.ts) is just an ordinary
 * `PropDef[]`, resolved through the same generic `PropertyField` rendering the
 * rest of the app already uses; no new UI-field mechanism is introduced for it.
 */
export interface FlowParamDef {
  key: string;
  label: string;
  type: PropType;
  required: boolean;
  options?: string[];
}

/**
 * Phase 5: a reusable, parameterized flow *definition* (HLD-successor —
 * "Reusable Flow Architecture"). `body` is an ordinary list of FlowNodes —
 * there is no second AST — whose prop values may contain `{{paramKey}}`
 * tokens (engine/reusableFlows.ts's `interpolate`) referencing `params`.
 * Expansion (substituting an invocation's arguments and splicing the result
 * into the existing generator) happens only at generation time and never
 * mutates this definition — see `engine/reusableFlows.ts`.
 */
export interface ReusableFlowDef {
  id: string;
  name: string;
  description?: string;
  params: FlowParamDef[];
  body: FlowNode[];
}

/**
 * Phase 8: a starter test template (`config/testTemplates.json`) — a
 * complete, pre-built flow a user can load onto an empty canvas instead of
 * starting from a blank describe/it. `flow` is an ordinary `FlowNode` tree,
 * the same shape as `AppState.flow` — loading a template is just `LOAD_FLOW`
 * with fresh ids substituted throughout (`state/flowTree.ts`'s
 * `cloneWithNewIds`), so two instantiations of the same template never share
 * an id. Static config, like the registry — never mutated at runtime (authoring
 * a new template is out of scope, same as the registry itself).
 */
export interface TestTemplateDef {
  id: string;
  name: string;
  description: string;
  flow: FlowNode;
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
   * Whether the dedicated validation panel is open (Phase 5F). Same "pure UI
   * state alongside the rest" precedent as `isCodeDrawerOpen` — independent of
   * it, so a user can read generated code and validation results in either
   * order, or both at once. The panel renders `findUnresolvedNodes` /
   * `findSemanticIssues` results (via `app/hooks.ts`) exactly as the code
   * drawer's own warning sections already do; this flag only controls whether
   * that same, single source of truth is *additionally* shown in its own panel.
   */
  isValidationPanelOpen: boolean;
  /**
   * Which tree nodes are collapsed on the canvas, keyed by stable node id (never
   * by index, so reordering can't transfer one node's state to another). Pure UI
   * state: it is deliberately *not* part of the Flow JSON, never reaches
   * `processFlow`, and cannot change the generated code. It lives in Redux rather
   * than in TreeNode because the code drawer has to expand a warning's ancestors
   * from outside the canvas.
   */
  collapsedNodeIds: Record<string, true>;
  /**
   * Phase 5: the reusable-flow library — seeded at startup from bundled config
   * (config/reusableFlows.json, mirroring how the registry seeds from its own
   * config files), read by `processFlow`/`findUnresolvedNodes`/`findSemanticIssues`
   * for expansion and validation, and by the property editor for an invocation
   * node's dynamic schema. Authoring/editing the library is out of Phase 5 scope
   * (it stays a data/file-level operation for now), so nothing currently mutates
   * this field — it lives in Redux rather than the registry because a future
   * authoring UI will need to change it at runtime, unlike the static registry.
   */
  reusableFlows: ReusableFlowDef[];
  /**
   * Phase 5: undo/redo history around the single `applyFlow` choke point
   * (state/builderSlice.ts). `past` holds snapshots older than the current
   * `flow`, nearest-previous last; `future` holds snapshots newer than it,
   * nearest-next last — the standard `past[] / current / future[]` shape.
   * Undo/redo themselves never push onto either stack (they only move entries
   * between them); any *other* flow mutation pushes the pre-mutation flow onto
   * `past` and clears `future`. Pure history bookkeeping — never serialized into
   * the Flow JSON, never read by `processFlow`.
   */
  history: {
    past: (FlowNode | null)[];
    future: (FlowNode | null)[];
  };
  /**
   * Phase 8: multi-select — ids beyond the single `selectedNodeId`, keyed by
   * stable node id (same "set via object" precedent as `collapsedNodeIds`).
   * Empty means "not in multi-select mode": every consumer treats the
   * effective selected set as `selectedNodeId` alone in that case, never as
   * zero nodes — see `app/hooks.ts`'s `useSelectedNodeIds`, the single place
   * that combines the two into one derived set so no component re-implements
   * the "empty means fall back to the primary" rule itself. Pure UI state,
   * same as `selectedNodeId` and `collapsedNodeIds` — never part of the Flow
   * JSON, never read by `processFlow`.
   */
  multiSelectedIds: Record<string, true>;
  /**
   * Phase 8: shift-click range-select's anchor — the fixed endpoint repeated
   * shift-clicks extend from (the file-manager convention: click A, then
   * shift-click D selects A..D; shift-clicking B next selects A..B, not
   * D..B, because the anchor never moves on a shift-click itself). Set by a
   * plain click or a Ctrl/Cmd toggle (`SELECT_NODE`/`TOGGLE_MULTI_SELECT`);
   * left untouched by `SELECT_RANGE`. A stale id (its node was deleted, or a
   * new flow loaded) is handled by `SELECT_RANGE` falling back to a plain
   * selection, not by proactively clearing this — see
   * `state/builderSlice.ts`.
   */
  rangeAnchorId: string | null;
  /**
   * Phase 9: whether the "Build Test" compile-ready panel is open. Pure UI
   * state, same precedent as `isCodeDrawerOpen`/`isValidationPanelOpen` — the
   * panel's own content (`engine/buildSpec.ts` + `engine/compileCheck.ts`'s
   * output) is always re-derived from `flow`/`reusableFlows`, never stored.
   */
  isBuildPanelOpen: boolean;
}
