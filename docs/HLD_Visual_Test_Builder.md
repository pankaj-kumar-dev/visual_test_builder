# High-Level Design: Visual Test Builder

**Document Type:** High-Level Design (HLD)  
**Version:** 1.0  
**Status:** Draft — Engineering Review  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals](#2-goals)
3. [Non-Goals](#3-non-goals)
4. [Architecture Overview](#4-architecture-overview)
5. [High-Level Architecture Diagram](#5-high-level-architecture-diagram)
6. [Major Components](#6-major-components)
7. [UI Architecture](#7-ui-architecture)
8. [Flow Model Design](#8-flow-model-design)
9. [Configuration Registry](#9-configuration-registry)
10. [Data Model](#10-data-model)
11. [Data Flow](#11-data-flow)
12. [Code Generation Approach](#12-code-generation-approach)
13. [UI Interaction Model](#13-ui-interaction-model)
14. [State Management Strategy](#14-state-management-strategy)
15. [Frontend Storage Strategy](#15-frontend-storage-strategy)
16. [Error Handling](#16-error-handling)
17. [Extensibility](#17-extensibility)
18. [Assumptions](#18-assumptions)
19. [Constraints](#19-constraints)
20. [Future Scope](#20-future-scope)

---

## 1. Overview

The Visual Test Builder is a frontend-only, browser-based tool that allows users to construct Cypress test flows visually and generate the corresponding Cypress test code.

The tool operates as a code generator, not a test runner. A user builds a test flow by dragging structural and command nodes onto a canvas, configures node properties via a property editor, and receives generated Cypress code as output.

The system follows a compiler-like model:

```
Visual Flow → Flow JSON → Tree Traversal → Generated Cypress Code
```

The Flow JSON is the single source of truth. The canvas is a visual representation of it. The generated code is a derived output.

---

## 2. Goals

- Allow users to visually construct Cypress test flows without writing code manually.
- Store the entire test definition as a portable, serializable Flow JSON tree.
- Drive all rendering, validation, and code generation from static configuration files — no command-specific logic hardcoded in the application.
- Generate syntactically correct Cypress test code from the Flow JSON.
- Keep the system frontend-only with no backend dependency.
- Keep the architecture minimal and implementable by a small frontend team.

---

## 3. Non-Goals

The following are explicitly out of scope for this design:

- Test execution or Cypress runner integration
- Backend APIs, databases, or authentication
- Browser automation or DOM inspection
- Automatic locator generation or smart selector suggestions
- Recording user actions
- AI, machine learning, or any intelligent assistance
- CI/CD integration
- Cloud deployment or collaboration features
- Version control or history
- Multi-user or shared workspaces

---

## 4. Architecture Overview

The system is a single-page frontend application with four functional layers:

| Layer | Responsibility |
|---|---|
| Configuration Layer | Defines structural nodes, commands, and their editable properties via static JSON files |
| Registry Layer | Loads configuration files into memory at startup; used by all other layers at runtime |
| UI Layer | Canvas for drag-and-drop flow building; property editor for node configuration |
| Processing Layer | Reads the Flow JSON, traverses the tree, and generates Cypress code |

These layers are decoupled. The UI layer reads from the registry to render drag handles and property fields. The processing layer reads from the registry to resolve node definitions during code generation.

State is held in-memory during a session and optionally persisted to browser storage between sessions.

---

## 5. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Visual Test Builder (SPA)                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Configuration Layer                     │   │
│  │  building-blocks.json  │  functions.json  │  function-props.json │
│  └─────────────────────────────┬────────────────────────────┘   │
│                                │ loaded at startup              │
│  ┌─────────────────────────────▼────────────────────────────┐   │
│  │                    In-Memory Registry                    │   │
│  │  BlockRegistry  │  FunctionRegistry  │  PropRegistry     │   │
│  └────────┬────────────────────┬─────────────────┬──────────┘   │
│           │                    │                 │              │
│           ▼                    ▼                 ▼              │
│  ┌──────────────┐   ┌──────────────────┐  ┌──────────────────┐  │
│  │  Left Panel  │   │  Canvas (Center) │  │  Right Panel     │  │
│  │  Node Palette│   │  Flow Builder    │  │  Property Editor │  │
│  └──────────────┘   └────────┬─────────┘  └──────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│                    ┌──────────────────┐                         │
│                    │    Flow JSON     │  ← Single Source of     │
│                    │  (App State)     │    Truth                │
│                    └────────┬─────────┘                         │
│                             │                                   │
│                             ▼                                   │
│                    ┌──────────────────┐                         │
│                    │ Processing Engine│                         │
│                    │ (Tree Traversal) │                         │
│                    └────────┬─────────┘                         │
│                             │                                   │
│                             ▼                                   │
│                    ┌──────────────────┐                         │
│                    │  Generated Code  │                         │
│                    │  (Output Panel)  │                         │
│                    └──────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Major Components

### 6.1 Configuration Files

Static JSON files loaded at application startup. They define the complete set of allowed nodes, commands, and properties. No node-specific logic is permitted outside these files.

| File | Purpose |
|---|---|
| `building-blocks.json` | Defines structural nodes: `describe`, `it`, `beforeAll`, etc. |
| `functions.json` | Defines supported Cypress command nodes: `click`, `type`, `visit`, `should`, etc. |
| `function-props.json` | Defines the editable properties for each command node: field name, type, label, required flag |

### 6.2 In-Memory Registry

Loaded once at startup from the configuration files. Provides a lookup interface to all other components. No component reads configuration files directly after initialization.

Responsibilities:
- Expose `getBlock(type)` — returns structural node definition
- Expose `getFunction(type)` — returns command node definition
- Expose `getProps(type)` — returns the property schema for a given command

### 6.3 Node Palette (Left Panel)

A static list of draggable node items. Sourced entirely from the registry at render time. Adding a new node type to configuration automatically makes it appear in the palette.

### 6.4 Canvas

The primary interaction area. Users drag nodes from the palette onto the canvas and arrange them as a tree.

Responsibilities:
- Accept dropped nodes and insert them into the Flow JSON at the correct position
- Render the current Flow JSON tree as a visual hierarchy
- Allow node reordering via drag-and-drop within the tree
- Allow node deletion
- Emit selection events when a node is clicked (consumed by the property editor)

The canvas does not own state. It reads from and writes to the central Flow JSON state.

### 6.5 Property Editor (Right Panel)

Displays editable fields for the currently selected node. Fields are rendered dynamically based on the node's property schema from the registry.

Responsibilities:
- Render input fields from `function-props.json` for the selected node type
- Write field value changes back to the corresponding node's `props` in the Flow JSON
- Show validation errors inline when required fields are missing or invalid

### 6.6 Processing Engine

A pure function. Takes the Flow JSON as input, traverses it recursively, and returns a Cypress code string.

```
processFlow(flowJson: FlowNode): string
```

No side effects. No external reads. Stateless between calls.

### 6.7 Output Panel (Bottom Panel)

Displays the string output of the processing engine. Refreshes whenever the Flow JSON changes. Optionally provides a copy-to-clipboard control.

---

## 7. UI Architecture

### Layout

```
┌────────────┬────────────────────────────┬──────────────────┐
│            │                            │                  │
│  Left      │         Canvas             │   Right Panel    │
│  Panel     │    (Drag-and-Drop Flow)    │   (Properties)   │
│  (Palette) │                            │                  │
│            │                            │                  │
├────────────┴────────────────────────────┴──────────────────┤
│                  Bottom Panel (Output Preview)             │
└────────────────────────────────────────────────────────────┘
```

### Panel Responsibilities

**Left Panel**
- Renders a list of draggable node chips grouped by category (Structural, Commands)
- Node list is sourced from the registry
- Supports drag initiation with node type metadata

**Center Canvas**
- Renders the Flow JSON tree as nested, indented node blocks
- Each node block displays: node type label, a delete button, and a drag handle for reordering
- Accepts drops from the palette and within-canvas reordering
- Highlights drop targets during drag
- Emits `onNodeSelect(nodeId)` on click

**Right Panel**
- Listens to `selectedNodeId`
- Looks up the node's property schema from the registry
- Renders form fields (text input, dropdown, etc.) based on prop type
- Writes changes to the Flow JSON immediately on change (no separate save action)

**Bottom Panel**
- Reads the output string from the processing engine
- Displays it in a read-only code block with syntax highlighting
- Provides a copy button

---

## 8. Flow Model Design

### Structure

The flow is a recursive tree. Each node has a type, optional children, and optional props.

```
FlowNode {
  id:       string          // unique within the tree
  type:     string          // e.g. "describe", "it", "click"
  props?:   Record<string, string>  // command-specific properties
  children?: FlowNode[]    // only structural nodes have children
}
```

### Valid Nesting Rules

Defined in `building-blocks.json`. Example:

| Parent | Allowed Children |
|---|---|
| `describe` | `it`, `beforeAll`, `afterAll` |
| `it` | Any command node |
| command node | None (leaf nodes) |

Nesting rules are configuration-driven. The canvas enforces allowed drop targets based on these rules.

### Example Flow JSON

```json
{
  "id": "node-1",
  "type": "describe",
  "props": { "label": "Login Suite" },
  "children": [
    {
      "id": "node-2",
      "type": "it",
      "props": { "label": "Successful Login" },
      "children": [
        {
          "id": "node-3",
          "type": "type",
          "props": { "selector": "#username", "value": "admin" }
        },
        {
          "id": "node-4",
          "type": "click",
          "props": { "selector": "#login" }
        }
      ]
    }
  ]
}
```

---

## 9. Configuration Registry

### Purpose

Centralize all node definitions in static JSON. At runtime, these files are loaded once and merged into an in-memory registry used throughout the application.

### Configuration Files

**`building-blocks.json`**

```json
[
  {
    "type": "describe",
    "label": "Describe Block",
    "category": "structural",
    "allowedChildren": ["it", "beforeAll", "afterAll"],
    "props": [
      { "key": "label", "label": "Suite Name", "type": "text", "required": true }
    ]
  },
  {
    "type": "it",
    "label": "Test Case",
    "category": "structural",
    "allowedChildren": ["click", "type", "visit", "should"],
    "props": [
      { "key": "label", "label": "Test Name", "type": "text", "required": true }
    ]
  }
]
```

**`functions.json`**

```json
[
  { "type": "click",  "label": "Click",  "category": "command" },
  { "type": "type",   "label": "Type",   "category": "command" },
  { "type": "visit",  "label": "Visit",  "category": "command" },
  { "type": "should", "label": "Assert", "category": "command" }
]
```

**`function-props.json`**

```json
{
  "click": [
    { "key": "selector", "label": "Selector", "type": "text", "required": true }
  ],
  "type": [
    { "key": "selector", "label": "Selector", "type": "text", "required": true },
    { "key": "value",    "label": "Value",    "type": "text", "required": true }
  ],
  "visit": [
    { "key": "url", "label": "URL", "type": "text", "required": true }
  ],
  "should": [
    { "key": "selector",  "label": "Selector",  "type": "text",     "required": true },
    { "key": "assertion", "label": "Assertion",  "type": "dropdown", "required": true,
      "options": ["be.visible", "not.exist", "contain", "have.value"] },
    { "key": "value",     "label": "Value",      "type": "text",     "required": false }
  ]
}
```

### Registry Interface

```
Registry {
  getBlock(type: string)    → StructuralNodeDef | null
  getFunction(type: string) → CommandNodeDef | null
  getProps(type: string)    → PropDef[] | []
  getAllBlocks()             → StructuralNodeDef[]
  getAllFunctions()          → CommandNodeDef[]
}
```

All consumers call registry methods. No component reads config files directly after startup.

---

## 10. Data Model

### Core Types

```typescript
// A single node in the flow tree
interface FlowNode {
  id: string;
  type: string;
  props?: Record<string, string>;
  children?: FlowNode[];
}

// Structural node definition (from building-blocks.json)
interface StructuralNodeDef {
  type: string;
  label: string;
  category: 'structural';
  allowedChildren: string[];
  props: PropDef[];
}

// Command node definition (from functions.json)
interface CommandNodeDef {
  type: string;
  label: string;
  category: 'command';
}

// Property field definition (from function-props.json)
interface PropDef {
  key: string;
  label: string;
  type: 'text' | 'dropdown';
  required: boolean;
  options?: string[];   // only used when type = 'dropdown'
}

// Application state
interface AppState {
  flow: FlowNode | null;          // the root of the Flow JSON tree
  selectedNodeId: string | null;  // currently selected node in the canvas
  generatedCode: string;          // latest output from the processing engine
}
```

---

## 11. Data Flow

### Flow on Node Drop (Palette → Canvas)

```
User drags node from palette
        │
        ▼
Canvas receives drop event with { type }
        │
        ▼
Validate: is drop target an allowed parent?
(check registry.getBlock(parentType).allowedChildren)
        │
        ├── Invalid → show error, discard drop
        │
        ▼
Create new FlowNode { id: uuid(), type, props: {} }
        │
        ▼
Insert node into Flow JSON at drop position
        │
        ▼
Update App State (flow)
        │
        ▼
Processing Engine re-runs → update generatedCode
```

### Flow on Property Edit

```
User edits a field in the property editor
        │
        ▼
Write new value to flow[selectedNodeId].props[key]
        │
        ▼
Update App State (flow)
        │
        ▼
Processing Engine re-runs → update generatedCode
```

### Flow on Code Generation Trigger

```
App State (flow) changes
        │
        ▼
Processing Engine(flow) called
        │
        ▼
Traverse tree recursively
        │
        ▼
Resolve each node's code template from registry
        │
        ▼
Interpolate props into template
        │
        ▼
Return code string
        │
        ▼
Output Panel renders updated code
```

---

## 12. Code Generation Approach

### Mechanism

The processing engine performs a depth-first traversal of the Flow JSON tree. For each node, it resolves the code template from the registry, interpolates the node's `props`, and wraps it within any parent block it belongs to.

No switch statements or if-chains per node type. All templates are configuration-driven.

### Code Template in Registry

Each node definition in the configuration carries an optional `codeTemplate` field:

```json
{
  "type": "click",
  "codeTemplate": "cy.get('{{selector}}').click();"
}
```

```json
{
  "type": "it",
  "codeTemplate": "it('{{label}}', () => {\n{{children}}\n});"
}
```

Template variables:
- `{{key}}` — replaced with the node's `props[key]` value
- `{{children}}` — replaced with the concatenated output of all child nodes

### Traversal Pseudocode

```
function generate(node: FlowNode): string {
  const def = registry.getBlock(node.type) ?? registry.getFunction(node.type);
  let childrenCode = '';

  if (node.children?.length) {
    childrenCode = node.children.map(generate).join('\n');
  }

  let code = def.codeTemplate;
  for (const [key, value] of Object.entries(node.props ?? {})) {
    code = code.replace(`{{${key}}}`, value);
  }

  return code.replace('{{children}}', indent(childrenCode));
}
```

### Example Output

Flow JSON → Generated Code:

```js
describe('Login Suite', () => {
  it('Successful Login', () => {
    cy.get('#username').type('admin');
    cy.get('#login').click();
  });
});
```

---

## 12A. Block / Callback Composition (Phase 2)

Extends §12 with a third composition mode alongside independent statements and
subject chains.

| Mode | `childComposition` | Children compose as |
|---|---|---|
| statement (default) | unset | independent statements, joined by `\n`, substituted into `{{children}}` — the original §12 behavior |
| chain | `'chain'` | one composed subject expression (`cy.get(x).find(y).click()`) — §12's Phase 2 chain generator |
| block | `'block'` | independent statements (same rule as the default), nested inside a Cypress callback body |

A block node (`within`, `then`, `each`, `session`) is structurally an ordinary
node with `children` and `props` — the `childComposition: 'block'` marker
exists for validation (an empty block is flagged, not silently generated as a
pointless shell — HLD §16) and the tree UI (a visual accent), never for
generation, which stays uniform: every node's template is resolved through the
same `{{key}}` → `{{children}}` → `{{params}}` substitution pipeline regardless
of composition mode.

### Callback Bindings

A block declares `bindsParameters: string[]` — its callback's parameter list,
outermost first. Each entry is either a literal token (`each`'s fixed `"$el"`,
`"index"`) or a `"{{key}}"` reference to one of the block's own props (`then`'s
`"{{as}}"`, a user-editable field). Resolution is one function
(`resolveBindingNames`) shared by the generator — building the actual
`{{params}}` text — and by `NodeContext` — deriving which names are visible to
descendants (`bindingsInScope`) — so the two can never disagree about what a
block actually binds. An entry with no usable value (an empty optional
`{{key}}`) is dropped from the signature entirely, never left as a hole.

A bound name behaves like a real JS closure variable: visible to every
descendant of the block that introduced it, and to every block nested inside
that one too (bindings accumulate while descending the tree). It is never
stored in the Flow JSON — always re-derived from tree structure, the same
"derived, not stored" rule §8/§14 already apply to everything else. A binding
is a distinct concept from an alias/reference (Future Scope, below): a binding
exists only for the lexical extent of its callback body; a reference (Phase 3
of the roadmap) is resolved by name lookup across the whole flow.

### Two New Property Types

- **`binding`** — a callback-bound identifier. Validated as a bare JS
  identifier (`/^[A-Za-z_$][A-Za-z0-9_$]*$/`); emitted unquoted, never escaped
  as a string. Invalid or absent: dropped from the callback signature if
  optional, or left as a visible `{{key}}` placeholder if required — the same
  "generator safety" rule the `number` type already applies to numeric slots.
- **`expression`** — a raw, trusted JS expression (e.g. `wrap`'s subject,
  `$row`). Emitted verbatim, unquoted and unescaped. This is the one
  deliberate trust boundary in the generator: arbitrary JS cannot be validated
  the way a number or identifier can, so use this type only where Cypress
  itself expects an expression rather than a string literal.

### Subject vs. Block

A block's `chainRole` (when present) governs whether it may *continue a
subject chain* (the chain mode above) — orthogonal to its own children, which
always compose as an independent body regardless. `within`/`then`/`each` are
`chainRole: 'subject'` (they need a preceding subject to scope or operate on);
`session` has none — it is always a standalone, root-level statement, the same
category as `visit`.

### Nesting and Indentation

Blocks nest freely in any combination — block-in-block, block-in-chain,
chain-in-block — because a block's children are generated through the exact
same recursive traversal as any other node's children; nothing about the
traversal changes based on composition mode. Indentation is exact at any depth
because each level's `indent()` call prefixes *every line* of its
already-fully-rendered children by one more level — a purely compositional
rule with no per-depth or per-command indentation logic.

---

## 12B. References, Variables and Data (Phase 3)

A *reference* is a Cypress alias (`.as('name')`, consumed as `cy.get('@name')`).
It is **not** the same mechanism as a Phase 2 callback binding, even though
both eventually become "a name available to later code":

| | Binding (§12A) | Reference (this section) |
|---|---|---|
| Lifetime | Closure-scoped — visible only to the block's own descendants | Flow-wide by name, within a *test scope* |
| Resolved by | The generator building the callback signature | Static lookup against everything produced earlier in scope |
| Ordering | N/A — always in scope inside the callback | Only visible to code that runs *after* its producer |
| Persisted as | Nothing — re-derived from `bindsParameters` | Nothing — re-derived from which nodes have a `reference-name` prop |

Collapsing these into one "names in scope" concept would lose exactly the
distinction Cypress itself relies on, so they are two mechanisms
(`engine/nodeContext.ts` vs `engine/references.ts`) sharing no state.

### Producers and Consumers

A node **produces** a reference by declaring a prop of type `reference-name`
(`as`'s `name`) — registry-driven, not a hardcoded command check. A node
**consumes** a reference by convention: any prop value starting with `@` is a
consumption, mirroring exactly how Cypress itself distinguishes an alias
lookup from a literal string at runtime. This means an existing field like
`get`'s `selector` needs no new type to support `cy.get('@row')` — it already
works as a plain `text` field; `PropDef.acceptsReference` is only a UI hint
(show the picker), never a generation or validation gate.

### Scope

References are visible according to real Cypress test structure:

- A `describe`-like node (`referenceScopeBoundary` in the registry) isolates
  each of its `it`/hook children from one another — a reference produced
  locally inside one test is invisible to a sibling test.
- A hook (`producesReferencesForSiblings` — `beforeAll`/`beforeEach`) is the
  one exception: its references are visible to *every* test in the suite,
  regardless of declaration order, because a hook always logically runs before
  any test.
- Everywhere else, visibility is plain document order: a reference produced by
  an earlier statement — including one produced deep inside a nested Phase 2
  block — is visible to every later statement in the same test, since Cypress
  aliases are test-global, not closure-scoped.

Both scope-defining facts are **registry metadata**, not a `node.type ===
'describe'` check — a future structural container with the same scoping
behavior (a `context()` alias, say) requires only a config flag, no code
change to the scope algorithm.

### Two New Property Types

- **`reference-name`** — the name a node produces. Validated as a bare
  identifier (reusing `binding`'s shape rule, kept a distinct type because the
  two concepts have different lifetimes) but **emitted quoted**, like `text`
  (`.as('name')` takes a string, unlike a binding's bare callback parameter).
- No new type exists for *consuming* a reference — see "Producers and
  Consumers" above.

### Validation

`engine/references.ts` is *semantic* validation — a genuinely different
question from `engine/unresolved.ts`'s *structural* validation (a required
field being empty is a shape problem; a reference resolving to nothing is a
meaning problem). It detects, statically:

- **unknown reference** — no producer exists anywhere in the flow;
- **reference before producer** — a producer exists, but only later in
  document order;
- **reference out of scope** — a producer exists and runs earlier, but in an
  unreachable scope (a sibling test, not a hook);
- **duplicate/shadowed reference** — a second producer reuses a name already
  in scope at that point (whether the earlier one was a hook or a local
  statement).

These are reported through their own UI surface (the code drawer's "Reference
issues" section, a distinct canvas row highlight), never merged into the
structural "Unresolved properties" list.

---

## 12C. Network (Phase 4)

Network support is **not a second alias system** — `cy.intercept(...).as('x')`
produces a reference through the exact same `as` command §12B already defines,
and `cy.wait('@x')` consumes it through the exact same `@name` convention. The
only new concept is one additional *ordering* rule.

### Commands

- **`intercept`** (`group: 'network'`, chain root) — `cy.intercept([method,] url[, stubResponse])`.
  `method` and `stubResponse` are optional template segments (§12); a raw
  `stubResponse` (type `expression`, Phase 2's trust boundary) covers static
  stubbing (`{ fixture: 'brands.json' }`, `{ statusCode: 200, body: [...] }`)
  without an object-AST — chained with `as`, this is the producer:
  `cy.intercept('GET', '/api/brands').as('getBrands');`
- **`waitAlias`** (chain root) — `cy.wait('{{alias}}')`. Its `alias` prop is
  a plain `text` field (`acceptsReference: true` for the picker only); nothing
  distinguishes a network alias from any other at the type level.
- **`request`** (chain root) — `cy.request({ method?, url, body? })`, an
  object-literal template with the same optional-segment technique. `body` is
  `expression` (a validated JSON/JS-object field, deliberately not a full
  payload-builder — §17 "Extensibility" already covers why). Chains naturally
  with the existing `then` (Phase 2) to bind and inspect the response:
  `cy.request({ url: '/api/brands' }).then((response) => { ... });`

Response inspection (`status`, `body`, headers) uses the existing `its` +
`should`/`and` chain — no dedicated "response mapping" node exists, because
none is needed.

### The ordering rule: `requiresTriggerBeforeUse`

`cy.wait('@alias')` for a network interception is meaningless unless a
request-triggering action happened between the intercept and the wait — the
request would otherwise never fire. This is checked generically:

- `CommandNodeDef.requiresTriggerBeforeUse` marks a command whose reference
  consumption needs an intervening trigger (`waitAlias`, and nothing else).
- "Trigger" reuses the existing palette taxonomy — any node whose `group` is
  `'action'` or `'browser'` — rather than adding a new metadata dimension for
  the same idea.
- `engine/references.ts` tracks, in the same document-order pass that already
  computes reference scope, which alias names have seen a trigger since their
  most recent production; a `requiresTriggerBeforeUse` consumption with none
  is reported as `reference-used-without-trigger`, through the same semantic-
  issue list §12B already defines.

A trigger before the *producer* doesn't count — only one after production and
before the consuming `wait` — and a trigger nested inside a Phase 2 block
between them still counts, because it reuses the same traversal.

---

## 12D. Multi-Slot Composition, Iteration, Reusable Flows, Custom Commands & Undo/Redo (Phase 5)

Phase 5 adds exactly one new architectural concept — **named child slots**
(`engine/slots.ts`) — plus one new **composition mode** on top of the existing
generator (`childComposition: 'reuse'`, mirroring how `'chain'` already works).
Everything else reuses Phase 1–4 machinery unchanged.

### Multi-slot composition (`if`)

A node may declare `StructuralNodeDef.slots: string[]` (e.g. `if`'s
`["then", "else"]`). Its children are then not an ordinary flat list but one
generic `slot` wrapper node per declared name — the *only* new structural node
type this phase adds for the mechanism itself — each holding its own ordinary
children:

```
if (condition: expression)
├── slot(name: "then")
│     └── ...ordinary children...
└── slot(name: "else")
      └── ...ordinary children...
```

- `slot` is registered once (`building-blocks.json`), reused by any current or
  future multi-slot construct; it never appears in the palette
  (`PaletteMetadata.hidden`) and is auto-seeded — one empty wrapper per
  declared slot name — the moment its host is added (`state/builderSlice.ts`'s
  `addNode`), driven by the `slots` array, never by the host's `type`.
- Generation: a template references a slot's contents with `{{slot:name}}`,
  and an *optional* slot's surrounding text with `[[slot:name: ...]]` — the
  same optional-segment syntax `[[key: ...]]` already uses for an empty prop,
  generalized to "this slot has no content" (`engine/processFlow.ts`). Neither
  token is `if`-specific; both are resolved generically off the slot wrapper,
  so a second multi-slot construct needs no generator change.
- Validation: a node's children are checked against its own `slots`
  declaration (or the absence of one) in both directions — a stray non-slot
  child under a slots-host, or a stray `slot` under a non-host — as one
  generic rule (`engine/unresolved.ts`, `engine/slots.ts`'s
  `hasInvalidSlotPlacement`), reported through the existing unresolved-node
  list rather than a new validator.

### Iteration (`forEach`)

`forEach` is an ordinary `childComposition: 'block'` node — exactly the same
composition Phase 2's `within`/`then`/`each` already use — with `bindsParameters:
["{{itemAs}}", "{{indexAs}}"]` resolved the same way `then`'s `as` is. No second
loop engine, no DOM-specific semantics: `{{source}}.forEach(({{params}}) => {
{{children}} });`, where `source` is a Phase 2 `expression` field (any JS array
or expression), and an unbound optional index is simply dropped from the
signature, the same rule `then`'s optional binding already follows.

### Custom commands (`customCommand`)

One static registry entry (`functions.json`) covers every project-defined
Cypress command: `commandName` (a `binding`-typed field — the existing
bare-identifier, unquoted-emission type, reused as-is for a method name) and an
optional `args` (Phase 2's trusted raw-`expression` field, `cy.{{commandName}}
([[args:{{args}}]])`). It is chain-participable (`chainRole: 'subject'`) with
an explicit (non-derived) standalone `codeTemplate`, so it works both as a
top-level `cy.someCommand(...)` statement and chained after a subject
(`cy.get(x).someCustomCommand(...)`) — no per-command UI, no arbitrary
JavaScript builder.

### Reusable flows (`flowInvocation`)

Four concepts, kept deliberately separate (`domain/types.ts`,
`engine/reusableFlows.ts`):

| Concept | Where it lives |
|---|---|
| **Definition** (`ReusableFlowDef`) | `state.reusableFlows` (Redux), seeded from `config/reusableFlows.json` — Login, Search |
| **Invocation** | An ordinary FlowNode, one registered type `flowInvocation` (`childComposition: 'reuse'`) |
| **Parameter** (`FlowParamDef`) | Part of a Definition — reuses `PropType`/`required`/`options`, the exact shape of a `PropDef` |
| **Argument** | The Invocation's own `props[paramKey]` value |

Expansion is a pure, non-mutating function: `expandInvocation` deep-copies a
Definition's `body` (ordinary FlowNodes), replacing every `{{paramKey}}` token
in a prop *value* with the Invocation's argument, then hands the result to the
**existing** generator (`generateNode`) exactly as if it had been authored
inline — no second AST, ever. Nesting one Invocation inside another
Definition's body works for free (the expanded body is generated recursively);
a `visiting` id chain threaded through generation renders a placeholder comment
instead of recursing forever if a cycle slips through, and
`engine/reusableFlows.ts`'s `findFlowCycle` statically detects a cyclic
Definition (directly or transitively) as a semantic issue before generation is
ever attempted.

The Invocation node's property schema is **dynamic**: `flowId` plus one field
per parameter of whichever Definition is currently selected
(`resolveInvocationSchema`), fed into the same generic `PropertyField`
rendering every other node already uses — one component, not one per flow. A
missing/invalid argument is caught by the same generic required-field rule
(`engine/unresolved.ts`) applied to that dynamic schema instead of a static one.

### Undo/redo

History hangs off the single existing `applyFlow` choke point
(`state/builderSlice.ts`) — no second state-management mechanism:

```
state.history = { past: FlowNode[], future: FlowNode[] }
```

Every flow-mutating action pushes the *pre-mutation* flow onto `past` and
clears `future`, unless the mutation was a genuine no-op (the pure
`state/flowTree.ts` helpers already return the identical reference for one,
e.g. reordering to the same index). `undo`/`redo` move a snapshot between
`past`/`future` through `applyFlow` with history recording turned off, so
undoing/redoing never itself creates a new step. Importing/loading a whole new
flow resets history rather than recording the discarded one.

---

## 12E. Switch/Case/Default, Try/Recover, Retry, and the Validation Panel (Phase 5 completion)

This section closes out Phase 5. It adds **zero new composition modes** and
**zero new generator branches** — every capability below is either ordinary
composition (the same mechanism `describe`/`it` have always used), the
existing `slots` mechanism from §12D reused a second time, or pure
configuration. Two capabilities that look plausible on paper — a generic
JavaScript `try/catch/finally` around Cypress commands, and a generic
"repeat N times" loop node — were deliberately **rejected** because they
cannot generate code that means what it looks like it means; the reasoning is
recorded below rather than silently omitted.

### Switch / Case / Default — unbounded ordinary composition + `childCardinality`

A `switch` has an *unbounded* number of `case` children (plus an optional
`default`) — a fixed-name `slots` array can't express "however many the user
adds," so this is **not** a slots construct. It is the same *ordinary* child
composition `describe`'s list of `it`s has always used, restricted only by two
new pieces of config:

```
switch (expression: expression)
├── case (value: expression)         ← any number, in source order
│     └── ...ordinary children...
├── case (value: expression)
│     └── ...ordinary children...
└── default                          ← zero or one
      └── ...ordinary children...
```

- `switch`'s `allowedChildren: ["case", "default"]` is a plain, literal list
  (not a `@group` wildcard) — the two child types exist to be a switch's
  children and nothing else's, so `case`/`default` are given their own
  palette group (`"switch"`, not `"control-flow"`) that no other node's
  `allowedChildren` references. This is a deliberate config choice, not an
  oversight: if `case` shared `"control-flow"` with `switch`/`if`/`try`, the
  existing `@control-flow` wildcard already on `it`/`beforeEach`/`within`/…
  would make a *switch-less* `case` droppable there too — syntactically a
  `case` statement outside any `switch`, which is a JavaScript
  `SyntaxError`. Keeping the group unshared makes that state unreachable
  through the UI at all, rather than reachable-then-flagged.
- **`childCardinality`** (`StructuralNodeDef.childCardinality`,
  `engine/unresolved.ts`) is the one small, genuinely new piece of metadata
  this phase adds: `{ case: { min: 1 }, default: { max: 1 } }`. It counts a
  node's ordinary children by `type` and reports a violation through the
  *same* unresolved-node list every other required-field violation already
  uses — no second warning system, no `node.type === 'switch'` check
  anywhere. It is deliberately generic (keyed by child type, not by host
  type), so a future construct with its own "at least N of this child" rule
  needs only its own config entry.
- Generation is the existing default case/case node in `renderBody` — each
  `case`/`default` node has an ordinary `{{children}}` `codeTemplate`
  (`case {{value}}:\n{{children}}\n  break;`), and `switch` itself joins its
  children exactly the way `describe` joins its `it`s. `case`'s `value` field
  is Phase 2's existing `expression` type (raw, unquoted — the same trust
  boundary `if`'s `condition` and `forEach`'s `source` already use), so
  `'admin'` and `2` are both valid case values without a new property type.

### Try / Recover — reusing `slots`, deliberately not plain `try`/`catch`/`finally`

**Rejected: literal JavaScript `try { ...cy commands... } catch (e) { ... }`.**
Cypress commands are enqueued, not executed synchronously — `cy.get(...)`
returns immediately having only *queued* the click; if that queued command
later fails, the failure surfaces asynchronously, long after the `try` block
that enqueued it has already returned. A real `try`/`catch` around Cypress
commands therefore almost never catches what a user would expect it to catch:
the `try` "succeeds" trivially every time, and the eventual command failure
becomes an unhandled test failure regardless of the `catch` block sitting
right next to it. Generating that shape would be **syntactically valid,
semantically misleading** JavaScript — exactly the class of output this
product refuses to produce (§16, §23's "never emit broken code," extended
here to "never emit code that lies about what it does").

**What ships instead** is Cypress's own documented recovery mechanism:
`cy.on('fail', (err) => { ...; return false })`, registered *before* the
commands it needs to observe, with the "Finally" body running unconditionally
afterward simply because it is the next thing in the command queue either
way. This is real, working Cypress — not an approximation of `try`/`catch`,
a different (and correct) mental model surfaced through familiar labels:

```
cy.on('fail', (err) => {   ← registered first, so it can see a failure below
  ...Catch body...
  return false;             ← swallows the failure, lets the test continue
});
{
  ...Try body...             ← queued after the handler is armed
}
{
  ...Finally body...         ← runs either way — it's just the next statements
}
```

`try` reuses §12D's `slots` mechanism a second time (`slots: ["try", "catch",
"finally"]`), the intended proof that the mechanism generalizes: no new
composition mode, no new generator token. Two new pieces support it, both
generic:
- **`requiredSlots: ["try", "catch"]`** (`StructuralNodeDef`,
  `engine/unresolved.ts`) — a Try with nothing to attempt, or a Catch with no
  declared recovery, is pointless; Finally is deliberately left out, since a
  cleanup-only slot is legitimately optional. Generic over any declaring
  host's own `slots`, via the same `slotHasContent` the generator itself
  reads — so a required slot can never be "satisfied" here without also being
  non-empty in the generated code, or vice versa.
- **Bare block statements** (`{ ... }`) wrap the Try and Finally bodies in the
  generated code. This is deliberately honest about the model: Cypress's fail
  handler stays armed for the rest of the test once registered (there is no
  clean, single-expression way to scope it to only the Try body), so the
  braces are presentational grouping — visually separating "what's being
  attempted" from "what always runs after" — not a JavaScript scope boundary
  that limits when the handler can fire. A user who needs the handler
  *disarmed* before later code runs still has `cy.removeListener('fail', …)`
  available as an ordinary custom command; this phase does not attempt to
  model that automatically.

### Retry — accepted as Cypress-native command/assertion retry, rejected as a generic loop node

The brief asked for one of: retrying an assertion, polling until a condition,
bounded repetition, application-level retry, or command retry configuration.
Two of those are already real, built-in Cypress behavior that needed no new
node at all — a query command and any assertion chained onto it already retry
automatically until it passes or a timeout elapses; the only thing missing
was a way to *tune* that timeout. So `get`/`contains`/`find` gained one
optional `timeout` (number, ms) prop, using the existing `[[key: ...]]`
optional-segment mechanism (`cy.get(selector, { timeout: 8000 })`) — pure
configuration, zero generator changes, and the one Cypress-native meaning of
"retry" this generator can express correctly.

**Rejected: a generic "Retry N times" / "Repeat Until" structural node.**
Cypress has no built-in bounded-repetition primitive, and the documented
community pattern for one — a named function that recursively re-queues
itself inside a `.then()` callback, checking a condition each time — requires
*defining a reusable, named, recursive function*, something this generator
has no concept of at all: every node here compiles to a flat template
substitution, never to a function declaration it can later call by name. Built
in this architecture, a "Retry" node could only ever generate one of two
things: a synchronous `for`/`while` loop around `cy` commands (which suffers
exactly the same enqueue-vs-execute mismatch that ruled out `try`/`catch`
above — the loop would finish before any of the enqueued commands had
actually run, and could not meaningfully react to their outcome), or a
one-off, hand-unrolled `.then()` chain per configured attempt count (which is
not "retry until success," just "run this fixed number of times regardless").
Neither is what a user asking for "retry" would mean. Rather than ship a node
whose name promises resilience it cannot deliver, this capability is
explicitly rejected pending a real function-definition mechanism — a
genuine architecture change, out of scope here (see §20).

### Reusable-flow starter library (expanded)

`config/reusableFlows.json` grew from the two original starters (Login,
Search) to nine, chosen for pattern diversity rather than count: **Login**,
**Logout**, **Search**, **Create/Read/Update/Delete Record** (the CRUD
family), **Grid Row Action** (the `chain`-composed get→eq→find→click /
get→eq→should pattern), and **Notification Validation** (the
intercept→as→trigger→wait→assert pattern, demonstrating Phase 3 references
and Phase 4 network ordering *inside* an expanded reusable flow). Logout
deliberately ships with zero parameters — not every flow has something worth
parameterizing, and forcing one would be exactly the "fake node" anti-pattern
this project has avoided elsewhere. No new engine mechanism was needed; every
entry is ordinary `body`/`params` data consumed by the pre-existing
`engine/reusableFlows.ts`.

One real gap this surfaced and fixed: `engine/references.ts`'s
`requiresTriggerBeforeUse` check (§12C) walks the *real* Flow JSON tree, and a
`flowInvocation` node has no real children there (only props) — so a trigger
action authored *inside* a reusable flow's body (e.g. Search's own `click`)
was invisible to a `waitAlias` sitting just after the invocation, producing a
false-positive "no trigger" warning. `reuseSubtreeContainsTrigger`
(`engine/references.ts`) closes this: for a reuse-composition node
specifically, it expands the invocation (the same `expandInvocation` the
generator already calls) and scans the result for a trigger, recursively
through any nested invocation, guarded against a cyclic reference the same
defensive way generation already is. This is the one piece of Phase 5J's
cross-feature verification that changed engine behavior rather than just
adding a test.

### Dedicated validation panel

`ui/validation/ValidationPanel.tsx` is a pure renderer over the two
pre-existing validation functions — `findUnresolvedNodes` (structural) and
`findSemanticIssues` (semantic) — via the same `app/hooks.ts` hooks the
canvas, property editor, and code drawer already read from. It introduces
exactly one new fact, `SemanticIssueSeverity` (`'error' | 'warning'`,
`engine/references.ts`), a fixed lookup table keyed by issue `kind` (only
`reference-used-without-trigger` is a warning; every structural issue and
every other semantic `kind` is an error) — computed once, in the engine, and
only ever read by the UI, never re-derived there. The panel is additive: it
opens/closes independently of the pre-existing code-drawer warning sections
(`state.isValidationPanelOpen`, mutually exclusive with the code drawer only
at the UI layer, since both currently occupy the same 4th workspace column),
so no existing code-drawer behavior changed. Selecting a row dispatches the
same `REVEAL_NODE` action the code drawer's warning list already used —
one "jump to this node" mechanism, not two.

### `allowedChildren` wildcards — verified, not rewritten

Phase 1 already introduced `@group` wildcard membership in `allowedChildren`
(`registry/registry.ts`'s `allowsChildType`); this phase's audit confirmed it
is the mechanism actually in use everywhere a hook/block admits a broad
category of children (`registry.test.ts`'s `allowsChildType` describe blocks,
extended here with the new `switch`/`try`/`case`/`default` cases). No
rewrite was needed or done. `switch` and `try` were added to the palette
simply by giving them `group: "control-flow"`, which the existing
`@control-flow` wildcard on `it`/`beforeEach`/`afterEach`/`within`/`then`/
`each`/`session`/`forEach` already picks up automatically — the exact
"a new command becomes context-aware by configuration alone" property §17
already promises.

---

## 13. UI Interaction Model

### Drag-and-Drop

- Nodes in the palette are draggable. Each carries its `type` as drag data.
- The canvas renders drop zones between and inside existing nodes.
- On drop, the canvas checks the target parent type against `allowedChildren` from the registry.
- Invalid drops are rejected silently with a visual indicator (e.g., red highlight on drop zone).

### Node Selection

- Clicking a node in the canvas sets `selectedNodeId` in app state.
- The property editor re-renders fields for the selected node type from the registry.
- Clicking outside a node clears the selection.

### Node Reordering

- Nodes within the same parent can be reordered via drag-and-drop within the canvas.
- Reordering modifies the `children` array order in the Flow JSON.

### Node Deletion

- Each node displays a delete button.
- Deleting a node removes it and all its descendants from the Flow JSON.
- If the deleted node was selected, selection is cleared.

### Property Editing

- Each editable field updates `props` on change (not on blur or submit).
- The code output updates in real time as properties are edited.

---

## 14. State Management Strategy

### Approach

A single centralized state object holds:

```typescript
{
  flow: FlowNode | null;
  selectedNodeId: string | null;
  generatedCode: string;
}
```

State is managed using the application's chosen state management mechanism (e.g., React Context + `useReducer`, Redux, or Zustand — choice is implementation detail, not defined here).

### State Update Rules

- All state mutations go through defined actions (e.g., `ADD_NODE`, `UPDATE_PROP`, `DELETE_NODE`, `SELECT_NODE`, `REORDER_NODE`).
- Direct mutation of the flow tree is not allowed. Use immutable update patterns.
- Code generation runs as a derived computation whenever `flow` changes. It is not stored separately as authoritative state — it is a pure function of `flow`.

### No Business State Outside Flow JSON

- The canvas renders from `flow`.
- The property editor reads from `flow[selectedNodeId].props`.
- The output panel reads from `generate(flow)`.
- No component maintains its own shadow copy of the flow.

---

## 15. Frontend Storage Strategy

### Session State

The Flow JSON and selected node state are held in-memory during the session. No persistence is required for the tool to function.

### Optional Persistence

For user convenience, the Flow JSON can be serialized to `localStorage` on change and rehydrated on load.

```
On flow change  → localStorage.setItem('vtb_flow', JSON.stringify(flow))
On app load     → flow = JSON.parse(localStorage.getItem('vtb_flow') ?? 'null')
```

This is optional. If the user clears browser storage, the flow is lost. No recovery mechanism is in scope.

### Export

The user can export the Flow JSON as a `.json` file for manual backup or sharing. This is a client-side file download (no server involved).

The user can also copy the generated Cypress code directly from the output panel.

---

## 16. Error Handling

### Invalid Drop Target

- The canvas checks allowed children before inserting a node.
- If the target parent does not allow the dropped node type, the drop is rejected.
- Visual feedback: red drop zone highlight during hover; drop is discarded on release.
- No error modal. No interruption to flow.

### Missing Required Props

- The property editor marks required fields with a visual indicator.
- If a required prop is empty when code generation runs, the generated code template retains the `{{key}}` placeholder verbatim rather than producing broken code.
- An inline warning is shown in the output panel listing nodes with unresolved props.

### Unknown Node Type

- If the Flow JSON contains a node type not present in the registry (e.g., loaded from a stale export), the processing engine skips that node and inserts a comment placeholder:

```js
// [Unknown node: custom-action] — not found in registry
```

### Registry Load Failure

- If configuration files fail to load at startup (e.g., missing file, JSON parse error), the application renders an error state and does not proceed to load the canvas.
- The error message identifies which configuration file failed.

### Malformed Flow JSON (on Import)

- If a user imports a Flow JSON file, it is validated against the expected schema before being accepted.
- Validation checks: root node present, each node has `id` and `type`, `children` is array if present, `props` is object if present.
- Invalid imports are rejected with a specific error message.

---

## 17. Extensibility

### Adding a New Command

1. Add an entry to `functions.json`.
2. Add its property schema to `function-props.json` with a `codeTemplate`.
3. No application code changes required.

### Adding a New Structural Block

1. Add an entry to `building-blocks.json` with `allowedChildren` defined and a `codeTemplate`.
2. No application code changes required.

### Adding a New Property Field Type

1. Add a new `type` value to the `PropDef` type (e.g., `"number"`, `"checkbox"`).
2. Add the corresponding renderer in the property editor's field renderer map.
3. The configuration files can then use the new type immediately.

### Key Design Principle

The registry is the only place where node behavior is defined. All rendering and generation logic is generic and works against the registry interface. This means the command surface of the tool is entirely data-driven.

---

## 18. Assumptions

1. The application is a single-page app (SPA) that runs entirely in the browser. No server-side rendering is required.
2. Configuration files (`building-blocks.json`, `functions.json`, `function-props.json`) are bundled with the application at build time. Runtime fetching is not required.
3. Node IDs are generated client-side using a UUID utility (e.g., `crypto.randomUUID()`). Uniqueness is within a single flow tree, not globally.
4. The `codeTemplate` field is part of each node definition in the configuration files. The exact field name and location within the config structure is subject to implementation detail but is assumed to exist.
5. The output panel performs client-side syntax highlighting only. No external service is used.
6. Only one Flow JSON tree is active at a time per browser session.
7. Browser `localStorage` is available if optional persistence is implemented.
8. The nesting depth of the flow tree is not formally bounded, but deeply nested trees (beyond 5–6 levels) are not an expected use case given Cypress test structure.

---

## 19. Constraints

| Constraint | Detail |
|---|---|
| Frontend-only | No backend. No API calls. No external services. |
| Static configuration | Command set is fixed at build time. No runtime configuration updates. |
| Single active flow | One flow tree per session. No multi-tab state sync. |
| No execution | The tool generates code only. It does not run tests or launch a browser. |
| No import validation recovery | If an imported Flow JSON is invalid, the entire import is rejected. Partial import is not supported. |
| Code generation is synchronous | The processing engine runs synchronously on every state change. For very large trees, this may need to be revisited (see Future Scope). |
| Cypress version specificity | Generated code targets Cypress v12+. The template syntax is not designed to be version-agnostic at this stage. |

---

## 20. Future Scope

These are realistic extensions that follow naturally from the current design. None are in scope for this version.

### Multi-Flow Management

Allow users to manage multiple named flow files within the same session (open, switch, save, delete).

### Flow JSON Import/Export — ✅ implemented (Phase 1)

Shipped as `state/flowIO.ts` (validate/serialize) + `state/persistence.ts`
(localStorage) + the Header's Export/Import controls. No schema versioning
yet — an import is accepted only if every node type is currently known to the
registry (§16 "Malformed Flow JSON (on Import)").

### Undo / Redo — ✅ implemented (Phase 5)

Shipped exactly as originally scoped here: `state.history = { past: FlowNode[],
future: FlowNode[] }` over the existing immutable Flow JSON, no second state
mechanism. See §12D.

### Validation Mode — ✅ implemented (Phase 5 completion)

Shipped as the dedicated `ui/validation/ValidationPanel.tsx`, a pure renderer
over the pre-existing `findUnresolvedNodes`/`findSemanticIssues` — error/
warning counts, a structured list, and click-to-reveal, alongside (not
replacing) the code drawer's own inline warnings. See §12E.

### Additional Cypress Command Support — ongoing, configuration-only (as designed)

The registry now covers 60 command nodes and 19 structural nodes (from 25
total at initial ship) purely by extending `functions.json`/`function-props.json`/
`building-blocks.json` — no engine or UI code changed to add any of them,
confirming the extensibility model this section originally predicted. Still
open: XPath selectors, file downloads (`cy.task`-backed), and a runtime
custom-command *registration* UI (today's `customCommand` node invokes a
project-defined command; it does not let a user define one from the canvas —
see §17's static-configuration constraint).

### Bounded Repetition / Retry-Until ("Repeat Until", generic loop)

Explicitly evaluated and rejected in Phase 5 completion (§12E) — this
generator has no function-definition mechanism, and Cypress's own retry
recipes for bounded polling require one (a named, recursively self-invoking
callback). Revisit only alongside a genuine architecture change that gives
the Flow JSON a way to declare a reusable, callable unit — a bigger step than
the reusable-*flow* mechanism (§12D), which expands inline at generation
time rather than compiling to a callable function.

### Template Export Format

Support generating test code in formats other than `.js` (e.g., TypeScript). This can be achieved by adding a `codeTemplate` variant per output format in the configuration.

### Asynchronous Code Generation

If flow trees grow large enough to cause noticeable delay during synchronous generation, move the processing engine to a Web Worker. The interface remains the same — it becomes a non-blocking call instead of a synchronous one.

---

*End of Document*
