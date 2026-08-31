# Visual Test Builder

Visual Test Builder is a frontend-only, browser-based tool for constructing Cypress
test flows visually and generating the corresponding Cypress test code. Users drag
structural and command nodes onto a canvas, configure node properties in a side
panel, and receive generated Cypress code as output. The tool is a code generator,
not a test runner — it never executes tests or launches a browser.

The system follows a compiler-like model: a visual flow is stored as a single
**Flow JSON** tree, which is the single source of truth. The canvas is a visual
representation of that tree, and the generated code is a derived output produced by
a pure processing engine. Node behaviour — which nodes exist, how they nest, and how
they compile to code — is defined entirely in static configuration files, not in
application code.

The project is intentionally minimal. There is no backend, no persistence, and no
runtime configuration. It is a single-page application designed to be implemented and
maintained by a small frontend team.

## Features

- Drag-and-drop construction of Cypress test flows.
- Structural nodes (`describe`, `it`, `beforeAll`, `afterAll`, `beforeEach`,
  `afterEach`) and 18 command nodes across a configuration-defined taxonomy — see
  [Supported Cypress Capabilities](#supported-cypress-capabilities) — all defined in
  configuration.
- A searchable palette with hierarchical categories, a collapsible flow tree, and a
  context-aware property editor — see [Scalable Builder UI](#scalable-builder-ui).
- A `chain` structural node for real Cypress command chaining/subject composition
  (`cy.get(...).find(...).click()`) — see [Command Chaining](#command-chaining-phase-2).
- Drop-target validation driven by each node's `allowedChildren` rules, including
  chain-position-aware validation (root command first, subject commands after).
- Node selection, deletion (including descendants), and reordering within a parent.
- A property editor that renders text and dropdown fields from each node's schema and
  writes changes back immediately.
- Inline indicators for required fields, and a warning listing nodes with unresolved
  required properties.
- Real-time generation of Cypress code from the Flow JSON.
- Read-only output panel with a copy-to-clipboard control.
- A startup error state that names the configuration file when the registry fails to
  load.

## Architecture

The application is a single-page frontend with four decoupled layers. The UI reads
from the registry and the Redux store and dispatches actions; the processing engine
reads the Flow JSON and the registry to produce code. No layer reaches around another.

### Configuration Layer

Four static JSON files, bundled at build time, define the entire node surface:

- `building-blocks.json` — structural nodes: `type`, `label`, `allowedChildren`,
  inline `props`, a `codeTemplate`, and palette metadata (`group`, `subgroup`,
  `description`, `keywords`).
- `functions.json` — command nodes: `type`, `label`, a `codeTemplate`, chain
  metadata, and the same palette metadata.
- `function-props.json` — the editable property schema for each command node,
  including each field's optional `visibleWhen` / `disabledWhen` context conditions.
- `categories.json` — the palette taxonomy: category `id`, `label`, optional
  `description` and `subgroups`. Array order *is* the palette's display order.

No node-specific logic exists outside these files. Adding a node type is a
configuration change, not a code change.

### Registry Layer

`createRegistry` loads the configuration into in-memory `Map` lookups and validates
it, throwing a `RegistryLoadError` (naming the offending file) on malformed or
duplicate definitions. `getRegistry()` builds this registry once, lazily, and caches
it. The registry exposes the only interface through which the rest of the app resolves
node and property configuration:

```
getBlock(type)      → StructuralNodeDef | null
getFunction(type)   → CommandNodeDef | null
getProps(type)      → PropDef[]
getAllBlocks()      → StructuralNodeDef[]
getAllFunctions()   → CommandNodeDef[]
getCategories()     → CategoryDef[]
```

Components never read the JSON files directly.

### UI Layer

React components arranged in a header/toolbar plus a three-panel workspace: a left
palette, a center canvas, and a right property editor. The generated-code panel is
not a fourth permanent region — it is a **code drawer** that opens over the workspace
from the right, toggled by the header's "`</>` Code" button (Phase 2 UI). Each
component has a single responsibility and holds no business state:

- **Header** hosts the app title and the code-drawer toggle; drawer open/closed state
  lives in Redux (`state.isCodeDrawerOpen`), not local component state.
- **Palette / paletteModel** render the registry-backed hierarchy and a search box
  over it. The component draws categories, subcategories, and chips; the taxonomy,
  its ordering, and the matching rules live in `paletteModel.ts` and configuration.
- **Canvas / TreeNode / SiblingDropZone** render the Flow JSON tree and handle
  drag-and-drop, selection, deletion, reordering, and collapse/expand, dispatching
  Redux actions. TreeNode also highlights a node with unresolved required properties.
- **PropertyEditor / PropertyField** render the fields the selected node's schema
  declares *for its current context* and dispatch `updateProp`; a field with an
  unresolved required value is highlighted the same way.
- **CodeDrawer** displays the generated code, a copy control, and the
  unresolved-properties warning — the same content the old always-visible output
  panel showed, now behind the toggle.

Drop validation is the only logic in the UI layer, and it is limited to interaction
rules (allowed drop targets and same-parent reordering). All structural updates happen
in the state layer.

### Processing Engine

`processFlow(flow)` is a pure, deterministic function. It performs a depth-first
traversal of the Flow JSON, resolves each node's `codeTemplate` from the registry,
interpolates the node's `props`, indents and inlines child output, and returns a
Cypress code string. It has no React, no Redux, and no side effects. A companion pure
function, `findUnresolvedNodes(flow)`, traverses the same tree to report required
properties left empty — this is the single source of truth for "unresolved" state.
`app/hooks.ts`'s `useUnresolvedNodes()` wraps it in one memoized selector so the code
drawer's warning list, the canvas's node highlighting, and the property editor's
field highlighting all read the same result instead of each re-implementing the rule
(Phase 2 UI).

### Data flow

1. A palette drop or a property edit is dispatched as a Redux action.
2. The reducer updates the Flow JSON immutably via pure tree helpers.
3. The same reducer re-derives `generatedCode` by calling `processFlow(flow)`.
4. The canvas, property editor, and code drawer (when open) re-render from the store.

## Project Structure

```
src/
├── app/          App shell, header/code-toggle, Redux Provider, typed hooks
│                 (incl. useUnresolvedNodes), startup error state
├── config/       Static JSON configuration (building blocks, functions, props,
│                 palette categories)
├── domain/       Core TypeScript types (FlowNode, node definitions, NodeContext,
│                 AppState)
├── engine/       Pure processing engine: processFlow, chain semantics, node
│                 context + property resolution, unresolved-props detection
├── registry/     Configuration registry: createRegistry, getRegistry, lookups
├── state/        Redux Toolkit slice, store, and pure immutable tree helpers
└── ui/
    ├── palette/     Left panel: search + category hierarchy + draggable chips
    ├── canvas/      Center panel: collapsible tree, drag-and-drop, unresolved highlight
    ├── properties/  Right panel: context-aware property fields + unresolved highlight
    ├── output/      Code drawer: generated code + copy + close + warning
    └── dnd.ts       Drag-and-drop payload contract
```

- **`app/`** composes the layout and gates startup on a successful registry load.
- **`config/`** is the source of all node behaviour.
- **`domain/`** holds shared types with no logic.
- **`engine/`** contains the framework-free code generator.
- **`registry/`** is the single configuration lookup.
- **`state/`** owns the Flow JSON and all mutations.
- **`ui/`** is presentation and interaction only.

## Tech Stack

- **React 18** — UI rendering.
- **Redux Toolkit** and **React-Redux** — centralized state and typed hooks.
- **TypeScript** — strict typing across all layers.
- **Vite** — dev server and production build.
- **Vitest** — unit tests for the pure registry/engine layer (`npm run test`).
- **Cypress** — smoke end-to-end tests (`npm run cy:run`).

No other runtime dependencies.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
```

## Type Checking

```bash
npm run typecheck
```

## Unit Tests

```bash
npm run test
```

Registry and code-generation coverage for every node type, including chain semantics
and drop validation (`src/registry/registry.test.ts`, `src/engine/processFlow.test.ts`,
`src/engine/unresolved.test.ts`, `src/engine/chain.test.ts`,
`src/ui/canvas/dropRules.test.ts`), plus the Scalable Builder UI's pure layers:
palette hierarchy and search (`src/ui/palette/paletteModel.test.ts`), node context
and property resolution (`src/engine/nodeContext.test.ts`), collapse state
(`src/state/collapse.test.ts`), and realistic 61/109/205-node flows
(`src/state/largeFlow.test.ts`).

## End-to-End Smoke Tests

```bash
npm run dev      # in one terminal
npm run cy:run   # in another, once the dev server is up
```

## How It Works

```
Palette
   ↓   drag a node onto the canvas
Redux Store
   ↓   ADD_NODE / UPDATE_PROP / DELETE_NODE / REORDER_NODE
Flow JSON
   ↓   processFlow(flow)
Processing Engine
   ↓   registry lookup + template interpolation
Generated Cypress Code
```

1. **Palette** — the user drags a node chip. The chip carries only the node `type`.
2. **Redux Store** — the canvas validates the drop against the registry, then
   dispatches an action. The reducer inserts, updates, deletes, or reorders the node
   using pure immutable tree helpers.
3. **Flow JSON** — the resulting tree is the single source of truth. Node ids are
   generated with `crypto.randomUUID()` in the action's `prepare` step so the reducer
   stays pure.
4. **Processing Engine** — on every flow change, the reducer re-derives the code by
   calling `processFlow(flow)`. The engine resolves each node's template from the
   registry and interpolates props; empty required props keep their `{{key}}`
   placeholder rather than producing broken code, and unknown node types are replaced
   with a comment.
5. **Generated Cypress Code** — the code drawer renders the derived string and offers
   a copy control, when opened via the header's code toggle.

## Design Decisions

- **Registry pattern.** All node definitions are loaded once into an in-memory
  registry that is the single lookup for configuration. This keeps a clean dependency
  direction: the UI and engine depend on the registry, never on the raw JSON.
- **Configuration-driven architecture.** Rendering, validation, and code generation
  are generic and operate against the registry interface. Adding a command or block is
  a configuration change with no application code changes, and there are no per-node
  switch statements.
- **Redux (Toolkit).** State is a single object — `flow`, `selectedNodeId`,
  `generatedCode`, `isCodeDrawerOpen`, `collapsedNodeIds` — mutated only through
  defined actions. Redux Toolkit provides the action/reducer structure and a
  `prepare` step for id generation while keeping the store shape close to the
  original HLD (the drawer flag and the collapse map are UI state, added alongside
  `selectedNodeId` rather than into the Flow JSON).
- **One unresolved-property detection, three UI surfaces.** `findUnresolvedNodes`
  (already used by the code drawer's warning) now also drives canvas node
  highlighting and property-field highlighting, via one shared hook
  (`useUnresolvedNodes`) rather than three separate implementations of the same rule.
  It resolves each node's schema through the same context-aware function the property
  editor uses, so "what fields does this node have here" is also answered once.
- **Derived context, not a second tree.** Node context is computed from the Flow JSON
  and registry metadata on demand. There is no parallel context structure to keep in
  sync, and no context data is serialized into the Flow JSON.
- **Presentation state stays out of the Flow JSON.** Collapse, selection and drawer
  visibility live in the Redux UI state; palette search and expanded categories are
  local to the palette. The generated code is a function of the Flow JSON alone.
- **Recursive rendering.** The Flow JSON is a tree, so the canvas renders it with a
  recursive `TreeNode` component. Drag-and-drop logic is extracted into a focused hook
  and helper so the recursive rendering stays readable.
- **Pure processing engine.** The engine is a stateless function with no framework
  dependencies. This makes code generation deterministic, easy to reason about, and
  independently testable.
- **Immutable updates.** Tree mutations are performed by pure helpers that return new
  trees and reuse the references of unchanged subtrees. `generatedCode` is always a
  derived value recomputed from `flow`, never set manually.

## HLD Compliance

The implementation follows the layered architecture defined in the High-Level Design:
a configuration layer, an in-memory registry, a UI layer, and a pure processing
engine. The Flow JSON tree is the single source of truth; the canvas is a view of it
and the generated code is a derived output.

Specific mappings:

- The registry interface, node definitions, and data model match the HLD types.
- The state layer implements exactly the defined actions — `ADD_NODE`, `UPDATE_PROP`,
  `DELETE_NODE`, `SELECT_NODE`, `REORDER_NODE` — with immutable updates and derived
  code generation.
- The processing engine reproduces the HLD traversal and template model, and its
  output matches the HLD's worked example.
- Error handling follows the HLD: invalid drops are silently rejected with a visual
  indicator, empty required props retain their placeholder, unknown node types become
  comments, and a registry load failure renders an error state naming the file.
- **Deviation from the HLD's literal layout (Phase 2 UI):** the HLD's bottom output
  panel is now a toggleable right-side code drawer instead of a fourth, permanently
  visible region. The underlying model is unchanged — `generatedCode` is still a pure
  function of `flow`, rendered read-only with a copy control — only its screen
  position and visibility are different, freeing full height for the canvas.

## Supported Cypress Capabilities

Everything below is a configuration entry in `src/config/` — none of it required an
`if`/`switch` in the processing engine. Verified by `src/engine/processFlow.test.ts`
and `src/registry/registry.test.ts` (`npm run test`) and the Cypress smoke suite
(`npm run cy:run`).

The categories below are the taxonomy in `categories.json`; the ones with no nodes
yet (Utility, Network beyond navigation, Data, Control Flow, Validation, Workflow,
Custom Command) are declared but not rendered.

```
Structural / Suite:
- describe
- it
Structural / Hooks:
- before (beforeAll)
- beforeEach
- afterEach
- after (afterAll)
Structural / Composition:
- chain (Phase 2 — see "Command Chaining" below)

Browser / Navigation:
- visit

Traversal / Element:
- get
- contains
- find
Traversal / Position:
- first
- last
- eq

Action / Mouse:
- click
- dblclick
Action / Input:
- type
- clear
- check
- uncheck
- select
Action / Focus:
- focus
- blur
Action / Viewport:
- scrollIntoView

Assertion (should):
- be.visible, not.exist, contain, have.value
- exist, be.hidden, be.enabled, be.disabled
- be.checked, not.be.checked
- have.text, contain.text, have.attr, have.class, have.length
```

### Command Chaining (Phase 2)

Every command node outside a chain is still the Phase 1 **self-contained statement**
described above — that behavior is unchanged and continues to work exactly as before.

For a real chained pipeline, drop a **Chain** node (Structural category) and build
inside it instead of directly under `it`/a hook:

```
Chain
 ├── get
 ├── find
 ├── first
 └── click
```

generates:

```javascript
cy.get('.items')
  .find('.item')
  .first()
  .click();
```

**Commands outside Chain remain independent statements.** Each still re-anchors via
its own `cy.get(selector)`, exactly as in Phase 1 — nothing about existing flows
changes.

**Commands inside Chain participate in subject composition.** A chain's first
command must be a *root* command (`get` or `contains` — it creates the initial
Cypress subject); every command after that must be a *subject*-role continuation
(`find`, `first`, `last`, `eq`, `click`, `type`, `clear`, `check`, `uncheck`, `select`,
`dblclick`, `focus`, `blur`, `scrollIntoView`, `should`) and is emitted as a `.method()`
suffix instead of a new statement. `visit` has no chain role and cannot be placed
inside a chain at all. An invalid arrangement (empty chain, no root, a second root, a
non-chainable command) is rejected at drop time and, as a last-resort check, renders
as `// [Invalid chain] — …` instead of broken code if one is ever constructed some
other way (see `src/engine/chain.ts`).

A two-command chain (one root + one continuation) prints on one line
(`cy.get('#login').click();`); three or more break onto indented continuation lines,
each two spaces deeper than the opening `cy...` line.

Every command's chain role and chain-suffix template live in `functions.json`
(`chainRole`, `chainTemplate`) — the same configuration-only extension model as
Phase 1. `find`, `first`, `last`, and `eq` still carry their own `selector` prop for
their *standalone* (non-chain) form; inside a chain the property editor hides that
field and the unresolved-property check skips it, because the subject already came
from an earlier node — see [Context-aware properties](#context-aware-properties).

## Code Drawer (Phase 2 UI)

The generated code is not a permanently visible panel — it lives in a DevTools-style
drawer that slides in from the right, opened with the header's "`</>` Code" button.
Closed by default, so the canvas gets the full workspace height; open on demand, so
the code is never more than one click away.

```
Header:  [ Visual Test Builder                              </> Code ]

Closed:  [ Palette | Canvas                          | Properties     ]

Open:    [ Palette | Canvas          | Properties     | Generated Code ]
                                                          Copy      ×
                                                          cy.visit(...);
                                                          cy.get(...)...
                                                          ---------------
                                                          Unresolved
                                                          properties:
                                                          • Assert: ...
```

- **One state, three surfaces.** The drawer's warning list, a canvas node's
  highlight, and a property field's highlight are all driven by the same
  `findUnresolvedNodes(flow)` result (via `useUnresolvedNodes`) — fix the field, and
  the node's highlight, the field's highlight, and the drawer's list all clear
  together, because they were never three separate calculations to begin with.
- **Consistent warning color.** The canvas highlight, the field highlight, and the
  drawer's warning box all use the same orange family (already used by the original
  output panel's warning box) — this is a validation state, not a fatal error.
- **Click a warning entry to jump to it.** Clicking an item in the drawer's
  unresolved-properties list selects that node (so the property editor shows it) and
  scrolls it into view on the canvas.
- **Independent scrolling.** The drawer has a fixed header; its body scrolls as a
  unit, with the code region itself separately scrollable and height-bounded so a
  long generated test can't push the warning section off-screen.
- **Responsive.** Desktop (≥1024px) adds the drawer as a 4th column without shrinking
  the other panels below usable width. Tablet (768–1023px) hides the property editor
  while the drawer is open, so the canvas keeps its room. Mobile (<768px) makes the
  drawer full screen.
- Escape closes the drawer from anywhere; the toggle button reports its state via
  `aria-pressed`.

## Scalable Builder UI

The palette supports hierarchical categories and search. The flow tree supports
collapsible nodes. The property editor adapts to node context. UI state is separate
from Flow JSON.

These four changes exist so the builder stays usable as the registry grows from the
current 25 nodes toward hundreds of Cypress capabilities, and as real flows grow to
hundreds of nodes. None of them changes the generated code.

### Palette search

A search box filters the same registry-backed node list the categories render —
there is no second node-selection system, and a result chip drags, validates, and
inserts through exactly the same path as a chip picked out of the tree.

A node is matched on its `type`, `label`, `description`, `keywords`, and its
`Category / Subcategory` breadcrumb. Matching is deliberately simple and
deterministic (no search dependency): the query is split on whitespace and every
token must appear, case-insensitively, as a substring somewhere in that text.
Results are ranked — name/label prefix, then name/label substring, then description,
keyword, and category hits — and ties keep configuration order.

While a search is active, navigation flattens: results are listed with their
breadcrumbs instead of behind five nested sections.

```
┌──────────────────────────────┐
│ Search nodes…            ×   │
├──────────────────────────────┤
│ SEARCH RESULTS           3   │
│                              │
│ Action / Input               │
│   Select                     │
│ Traversal / Element          │
│   Get                        │
│ Traversal / Position         │
│   Eq                         │
└──────────────────────────────┘
```

### Hierarchical categories

`categories.json` defines the taxonomy — `id`, `label`, optional `description`, and
optional `subgroups` — and the array order *is* the palette's category order. Each
node points at a category with `group` and, optionally, a subcategory with
`subgroup`:

```json
{ "type": "select", "group": "action", "subgroup": "input" }
```

```
▼ STRUCTURAL     7      ▼ TRAVERSAL     6      ▼ ACTION       10
    Suite                   Element                Mouse
      Describe Block          Get                    Click
      Test Case               Contains               Double Click
    Hooks                     Find                 Input
      Before All          Position                   Type
      …                       First                  …
```

Introducing a category, renaming one, reordering the taxonomy, or moving a command
between categories is a configuration change — the Palette component contains no
category names, no ordering, and no per-command branching. Categories declared in
configuration but with no nodes yet (Network, Data, Control Flow, Workflow, …) are
simply not rendered, so the taxonomy can be declared ahead of the commands.

Metadata is optional and degrades sensibly: a node with a `group` but no `subgroup`
is listed directly under its category (as `should` is under Assertion); a `group`
that matches no configured category still renders under a title-cased fallback; a
node with no `group` at all lands in an "Other" section at the end.

### Collapsible tree

Any node with children gets a disclosure control; command leaves do not. Collapse is
keyed by **stable node id**, so reordering siblings can never hand one node's state
to another, and a deleted node's state (and its whole subtree's) is dropped with it.
A collapsed row stays selectable, editable, draggable, and a valid drop target —
dropping into a collapsed node expands it so the new child is visible where it
landed.

```
▼ Describe Block  User Management        ▼ Describe Block  User Management
   ▼ Before Each                            ▶ Before Each   1
      ▼ Chain                               ▶ Test Case  Create   1
         Get  #app                          ▶ Test Case  Search   1
         Click                              ▶ Test Case  Edit     1
   ▼ Test Case  Create                      ▶ Test Case  Delete   1
      …
```

Each row also shows the first configured property value it has, which is what tells
fifty `Test Case` rows apart. That is a generic rule (first non-empty field in schema
order), not a per-command renderer.

### Context-aware properties

The property editor used to ask "what properties does this node type have?". It now
asks "what properties are valid for this node **in this context**?".

Context is derived, never stored — a pure function of the Flow JSON plus the same
registry metadata the chain engine already uses (`engine/nodeContext.ts`):

```typescript
interface NodeContext {
  parentType: string | null;
  isInsideChain: boolean;   // the parent composes children into one subject
  hasSubject: boolean;      // an earlier node already produced this node's subject
}
```

Visibility is metadata-driven, so a command becomes context-aware through
configuration rather than a React branch:

```json
{
  "key": "selector",
  "label": "Selector",
  "type": "text",
  "required": true,
  "visibleWhen": { "hasSubject": false }
}
```

The same command type therefore shows different fields in different places:

```
it > Click                        chain > Get > Click
  Selector *                        (no editable properties)
                                    Not applicable here: Selector —
                                    the subject comes from the previous command.

chain > Get                       chain > Get > Find        chain > Get > Eq
  Selector *                        Descendant Selector *     Index *
```

Two rules govern the distinction (§21): a field is **hidden** when it is genuinely
irrelevant in this context, and **disabled** when it still applies but cannot be
edited here. The editor names what a context hid rather than silently dropping it.

Crucially, `findUnresolvedNodes` resolves schemas through the *same* function, so
this is one rule with one result across all surfaces: a field hidden by context can
never appear as a warning the user has no way to fix. That closes the previous
"chain-context props are not hidden" limitation — a chained `.click()` no longer
demands a `Selector` its generated code never reads.

### UI state vs. Flow JSON

```
Flow JSON  =  the test definition   → flow tree, node props, node order
UI state   =  how you are viewing it → selection, code drawer, collapsed nodes,
                                       palette search, expanded categories
```

Nothing in the right column can change the generated Cypress. Collapse state lives
in Redux (`state.collapsedNodeIds`, keyed by node id) because the code drawer has to
expand a warning's ancestors from outside the canvas; palette search and expanded
categories are local component state, since nothing outside the palette reads them.
No UI flag is ever written into the Flow JSON.

### Warning navigation through collapsed nodes

Clicking an entry in the drawer's unresolved-properties list dispatches one action,
`revealNode`, which selects the node and expands every collapsed ancestor hiding it
(ancestors are read from the Flow JSON in the reducer). The selected row then scrolls
itself into view and its missing field is highlighted, with the drawer left open. The
unrelated branches stay collapsed.

## Known Limitations

These are intentional scope decisions, consistent with the design and its constraints:

- **Plain code block instead of syntax highlighting.** The output is a read-only,
  monospaced block with no highlighting library.
- **No persistence.** The Flow JSON lives in memory for the session only; there is no
  `localStorage` or other storage.
- **No import/export.** Only copy-to-clipboard of the generated code is provided;
  there is no Flow JSON file import or export.
- **Single-flow editor.** One Flow JSON tree is active per session.
- **No test execution.** The tool generates Cypress code targeting Cypress v12+ but
  does not run it.
- **Context conditions are structural only.** `visibleWhen` / `disabledWhen` compare
  against `isInsideChain` and `hasSubject`. A condition on another *property's value*
  (e.g. showing `should`'s numeric `count` only for `have.length`) is not supported;
  the field stays optional and always visible instead.
- **No command currently needs `disabledWhen`.** The mechanism is implemented and
  tested — the resolver marks the field read-only and the editor renders it that
  way — but every context-sensitive field in today's registry is genuinely
  irrelevant rather than temporarily uneditable, so all shipped conditions hide.
- **No reorder-time chain validation.** Dropping a node into a chain is validated
  live (§ "Command Chaining"), but reordering existing chain children is not — an
  invalid arrangement produced by a reorder is caught at generation time (rendered
  as `// [Invalid chain] — …`) rather than blocked while dragging.
- **No aliasing, network, or data commands yet.** `as()`/`cy.get('@alias')`,
  `intercept`, `wait`, `request`, `fixture`, and `within` are not implemented. The
  chain/subject model was designed to support these next (a root command already
  "produces a subject"; aliasing just needs a way to name and later re-open one)
  without another rewrite of the generator.
- **Unbounded nesting depth.** Deeply nested trees far beyond typical Cypress structure
  (HLD §18.8 assumes 5–6 levels) are not depth-guarded; extreme depths could exhaust the
  call stack. Not enforced by design.
- **Code drawer is not resizable.** It has a fixed default width per breakpoint
  (480px desktop / narrower tablet / full-screen mobile) rather than a drag-to-resize
  handle. The brief called this out as "prefer if clean" rather than required, and a
  fixed width kept the change smaller.
- **Mobile workspace is not a full redesign.** Below 768px the drawer itself goes full
  screen as required, but the palette/canvas/property editor (when the drawer is
  closed) simply stack vertically rather than getting a bespoke mobile layout — out
  of scope for a UI task centered on the drawer.
- **No palette or tree virtualization.** Both render every node. Search, hierarchy,
  collapse, and context come first; virtualization is deferred until profiling shows
  a need (validated here up to 205-node flows).
- **No keyboard navigation *between* tree nodes or palette chips.** The controls that
  were added (search field, category disclosures, node toggles) are focusable,
  named, and report their state, but there is no arrow-key roving focus across the
  tree, and no global shortcut to focus the search box.
- **Collapse state is not persisted.** Like the rest of the UI state it lives in
  memory for the session only.

## Future Improvements

These items come from the HLD's Future Scope and are not implemented:

- Multi-flow management (open, switch, save, delete named flows).
- Formalized Flow JSON import/export with schema versioning.
- Undo / redo via a command stack over the immutable flow state.
- A dedicated validation mode that reports missing required props as a structured
  list before generation.
- Additional Cypress command support through configuration only.
- Alternative template export formats (for example, TypeScript).
- Asynchronous code generation via a Web Worker for very large trees.

## Screenshots

![Palette](docs/images/palette.png)

![Canvas](docs/images/canvas.png)

![Output](docs/images/output.png)

## License

MIT
