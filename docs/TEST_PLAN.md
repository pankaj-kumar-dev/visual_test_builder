# Visual Test Builder — Test Plan

**Author role:** Senior QA Automation Engineer
**Status:** Phase 1 — Test Strategy
**Applies to:** the completed, feature-frozen implementation. No production code is
modified by this document.

---

## 1. Testing Objectives

- Verify the application generates **syntactically correct Cypress code** for every
  supported node and property combination.
- Verify the **Flow JSON is the single source of truth** and that the derived
  `generatedCode` stays synchronized with it after every action.
- Verify the **configuration-driven contracts**: the registry is the only config source,
  and drop validation follows `allowedChildren`.
- Verify the core **user journeys** (build a flow, edit properties, delete, reorder,
  copy output) work end to end.
- Verify the application **degrades gracefully** on invalid input, bad configuration, and
  hostile edge cases rather than crashing or corrupting state.
- Protect previously fixed defects (string escaping, optional `should`, UUID fallback)
  with regression coverage.

## 2. Scope

In scope: the frontend SPA as implemented — configuration layer, registry, Redux state
layer, processing engine, and the four UI panels. Behaviour is tested through pure
functions (unit), the Redux store (integration), and the rendered UI (end to end).

The build and typecheck gates (`npm run build`, `npm run typecheck`) are treated as
mandatory automated checks and are part of the release criteria.

## 3. Features Under Test

| Area | What is verified |
|---|---|
| Application boot | Registry builds; on failure, the error state names the file and the canvas does not mount |
| Registry | `getBlock` / `getFunction` / `getProps` / `getAllBlocks` / `getAllFunctions`; duplicate/missing-field validation |
| Palette | Chips sourced from registry, grouped Structural/Commands, draggable, carry node type |
| Canvas | Recursive tree rendering, selection, deletion (incl. descendants), palette drop, `allowedChildren` validation, sibling reordering |
| Property editor | Fields rendered from schema, `UPDATE_PROP` on change, required indicator, no local state |
| Processing engine | DFS traversal, template interpolation, **string escaping**, **optional `should` value**, unknown-node comment, placeholder retention |
| State layer | Five actions, immutable updates, derived-code invariant, selection clearing |
| Output panel | Read-only code, copy control, unresolved-properties warning |

## 4. Out of Scope

Explicitly not tested, because they are not implemented (by design / HLD Future Scope):

- Test execution / Cypress runner integration (the tool only generates code).
- Persistence (`localStorage`), import/export, undo/redo, multi-flow management.
- Syntax highlighting (plain code block by design).
- Theme / dark mode support.
- Backend, network, or authentication (there are none).
- Accessibility beyond basic semantics already present.

## 5. Test Pyramid (for this project)

This application is logic-heavy at the bottom (pure engine and tree algorithms) and
thin at the top (a small UI over a single store). The pyramid reflects that: most value
is in unit tests of pure functions; E2E is a focused smoke layer.

### Unit (largest layer — pure, no framework/UI)

Deterministic pure functions, the highest-ROI tests:

- `engine/processFlow` — traversal, indentation, `{{children}}`, unknown-node comment,
  placeholder retention.
- `engine/processFlow` `resolveProps` behaviour — **escaping** (quotes, backslashes,
  newlines) and **optional segments** (`should` with/without value).
- `engine/unresolved` — `findUnresolvedNodes` detection.
- `state/flowTree` — `findNode`, `insertNode`, `updateNodeProps`, `removeNode`,
  `moveNode` (including reorder edge cases).
- `ui/canvas/dropRules` — `canDropInto`, `reorderTargetIndex` (off-by-one).
- `registry/registry` — `createRegistry` lookups and `RegistryLoadError` validation.

> **Tooling note:** no unit-test runner is currently configured. The strategy recommends
> **Vitest** (native Vite integration, zero extra bundler config) for this layer. These
> functions are already exercised today by ad-hoc esbuild scripts; Vitest would formalize
> them. Implementation of this layer is **not** part of Phase 5 (Cypress smoke only).

### Integration (middle layer — store + registry, no browser)

- Redux slice: dispatch each of the five actions and assert resulting state **and** the
  derived `generatedCode` (the `applyFlow` invariant).
- Registry + engine: build a flow through the store and assert generated output matches
  the HLD example.
- Property-editor schema resolution: `getBlock(type)?.props ?? getProps(type)` for
  structural vs command nodes.

> Recommended tooling: Vitest (+ React Testing Library if component-level integration is
> desired). Not implemented in Phase 5.

### End-to-End (smallest layer — Cypress, real browser)

Focused smoke journeys through the rendered UI:

- App boots and the four panels render.
- Build a minimal valid flow via drag-and-drop.
- Edit a property and see the output update.
- Delete and reorder nodes.
- Copy the generated code.

> Recommended tooling: **Cypress** (requested). Only the **smoke** suite is automated in
> Phase 5. Drag-and-drop uses native HTML5 events plus a module-level `activeDrag` holder,
> which requires synthetic `dragstart`/`dragover`/`drop` events sharing one `DataTransfer`
> — noted as a real automation constraint (see §7 Automation and the testability notes).

## 6. Risk Assessment

### HIGH — correctness-critical, complex, or historically defective
- **Processing engine / generated Cypress correctness**, especially string escaping and
  the optional `should` argument (both are previously fixed [HIGH] defects).
- **Drag-and-drop**: palette insertion, `allowedChildren` validation, sibling reordering
  (index math), and the transient `activeDrag` state.
- **Derived-code synchronization** (`generatedCode` == `processFlow(flow)` after every
  action).
- **Tree mutation algorithms** (`insertNode` / `removeNode` / `moveNode`), including
  root deletion and descendant-selection clearing.

### MEDIUM — important but simpler or lower blast radius
- **Registry** load and validation (duplicate ids, missing template/allowedChildren).
- **Property editor** schema rendering and `UPDATE_PROP` dispatch.
- **Unresolved-properties warning** detection.
- **Boot error gate** (RegistryLoadError → named error state).

### LOW — cosmetic or stable
- Layout / grid regions.
- Styling, chip appearance, drop-zone highlight colours.
- Copy-button "Copied!" label timing.

## 7. Test Categories

- **Smoke** (automated, Cypress): critical happy-path journeys; must pass on every build.
  See `SMOKE_TESTS.md`.
- **Regression** (spec now, automate later): one test per fixed defect and high-risk area
  — escaping, optional `should`, reorder off-by-one, root deletion, code sync, unknown
  nodes, registry failure, UUID fallback. See `REGRESSION_TESTS.md`.
- **Negative** (spec now): invalid drops, unknown nodes, malformed payloads, huge/Unicode
  input, deep trees, cross-parent reorder, unexpected values — each asserting graceful
  behaviour. See `NEGATIVE_TESTS.md`.
- **Performance** (manual/measured): 100 / 500 / 1000 nodes; per-edit latency; confirm no
  freeze within HLD §18.8 expectations.
- **Boundary**: empty flow, single node, root deletion, empty required props, index
  clamping on reorder, empty config arrays.
- **Usability** (manual): drag feedback (valid/invalid highlight), selection clarity,
  copy feedback.
- **Manual**: cross-browser DnD parity (Chrome/Firefox/Edge), resize/zoom, deep-tree
  stack limits, insecure-context UUID fallback.
- **Automation**: unit + integration (Vitest, recommended) and smoke E2E (Cypress,
  implemented in Phase 5). Regression automation is deferred.

## 8. Release Criteria

A build is releasable only when all of the following hold:

1. `npm run typecheck` passes with no errors.
2. `npm run build` completes successfully.
3. All **smoke** tests pass (Cypress).
4. All **regression** scenarios pass (currently executed via the verification scripts /
   manual steps in `REGRESSION_TESTS.md`; to be automated in Vitest).
5. No uncaught exceptions and no React console errors/warnings during smoke execution.
6. Engine correctness confirmed: generated code for escaping and optional-`should` cases
   evaluates as valid JavaScript and arguments round-trip.
7. The derived-code invariant holds after a mixed action sequence.
8. No HIGH-risk defect open. MEDIUM/LOW defects documented as known limitations.

---

### Testability notes (carried into Phase 5)

- **No `data-testid` attributes exist** in the current UI. Available hooks today:
  region `aria-label`s (`Node palette`, `Flow canvas`, `Property editor`,
  `Generated code`), the delete button `aria-label` (`Delete <label>`), the copy button
  text (`Copy` / `Copied!`), the warning `role="alert"`, and stable CSS classes
  (`palette__item`, `tree-node__row`, `sibling-drop-zone`, `property-field__input`,
  `output__code`). Cypress smoke tests can be written against these, but a small set of
  `data-testid`s would make them far less brittle. Any such additions will be **listed
  for approval first** (Phase 5) and not made unilaterally.
- **Drag-and-drop** cannot be driven by Cypress's high-level commands; it needs synthetic
  HTML5 drag events sharing one `DataTransfer`, and the drag source must fire `dragstart`
  so the app's `activeDrag` holder is populated for hover validation. This is the single
  biggest E2E automation risk and is addressed with a reusable command in Phase 5.
