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
- Structural nodes (`describe`, `it`, `beforeAll`, `afterAll`) and command nodes
  (`click`, `type`, `visit`, `should`), all defined in configuration.
- Drop-target validation driven by each node's `allowedChildren` rules.
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

Three static JSON files, bundled at build time, define the entire node surface:

- `building-blocks.json` — structural nodes: `type`, `label`, `allowedChildren`,
  inline `props`, and a `codeTemplate`.
- `functions.json` — command nodes: `type`, `label`, and a `codeTemplate`.
- `function-props.json` — the editable property schema for each command node.

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
```

Components never read the JSON files directly.

### UI Layer

React components arranged in the four-region layout from the design: a left palette,
a center canvas, a right property editor, and a bottom output panel. Each component
has a single responsibility and holds no business state:

- **Palette** reads the registry and renders draggable node chips.
- **Canvas / TreeNode / SiblingDropZone** render the Flow JSON tree and handle
  drag-and-drop, selection, deletion, and reordering, dispatching Redux actions.
- **PropertyEditor / PropertyField** render fields from the selected node's schema and
  dispatch `updateProp`.
- **OutputPanel** displays the generated code and the unresolved-properties warning.

Drop validation is the only logic in the UI layer, and it is limited to interaction
rules (allowed drop targets and same-parent reordering). All structural updates happen
in the state layer.

### Processing Engine

`processFlow(flow)` is a pure, deterministic function. It performs a depth-first
traversal of the Flow JSON, resolves each node's `codeTemplate` from the registry,
interpolates the node's `props`, indents and inlines child output, and returns a
Cypress code string. It has no React, no Redux, and no side effects. A companion pure
function, `findUnresolvedNodes(flow)`, traverses the same tree to report required
properties left empty.

### Data flow

1. A palette drop or a property edit is dispatched as a Redux action.
2. The reducer updates the Flow JSON immutably via pure tree helpers.
3. The same reducer re-derives `generatedCode` by calling `processFlow(flow)`.
4. The canvas, property editor, and output panel re-render from the store.

## Project Structure

```
src/
├── app/          Application shell, Redux Provider, typed hooks, startup error state
├── config/       Static JSON configuration (building blocks, functions, props)
├── domain/       Core TypeScript types (FlowNode, node definitions, AppState)
├── engine/       Pure processing engine: processFlow + unresolved-props detection
├── registry/     Configuration registry: createRegistry, getRegistry, lookups
├── state/        Redux Toolkit slice, store, and pure immutable tree helpers
└── ui/
    ├── palette/     Left panel: draggable node chips
    ├── canvas/      Center panel: tree rendering + drag-and-drop
    ├── properties/  Right panel: property editor fields
    ├── output/      Bottom panel: generated code + copy + warning
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
5. **Generated Cypress Code** — the output panel renders the derived string and offers
   a copy control.

## Design Decisions

- **Registry pattern.** All node definitions are loaded once into an in-memory
  registry that is the single lookup for configuration. This keeps a clean dependency
  direction: the UI and engine depend on the registry, never on the raw JSON.
- **Configuration-driven architecture.** Rendering, validation, and code generation
  are generic and operate against the registry interface. Adding a command or block is
  a configuration change with no application code changes, and there are no per-node
  switch statements.
- **Redux (Toolkit).** State is a single object — `flow`, `selectedNodeId`,
  `generatedCode` — mutated only through defined actions. Redux Toolkit provides the
  action/reducer structure and a `prepare` step for id generation while keeping the
  store shape exactly as specified.
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
- **Unbounded nesting depth.** Deeply nested trees far beyond typical Cypress structure
  (HLD §18.8 assumes 5–6 levels) are not depth-guarded; extreme depths could exhaust the
  call stack. Not enforced by design.

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
