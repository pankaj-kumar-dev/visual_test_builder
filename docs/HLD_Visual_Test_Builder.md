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

### Flow JSON Import/Export

Formalized import and export of Flow JSON files with schema versioning, allowing teams to share flows as portable files.

### Undo / Redo

Implement action history using a command stack over the Flow JSON state (e.g., `past[]`, `present`, `future[]` pattern). No architectural change required — state management already treats flow as immutable.

### Validation Mode

A dedicated pass before code generation that checks all nodes for missing required props and reports them as a structured list, rather than inline output panel warnings.

### Additional Cypress Command Support

Expanding `functions.json` and `function-props.json` to include additional Cypress commands (e.g., `intercept`, `fixture`, `aliases`). No code changes required — configuration-only extension.

### Template Export Format

Support generating test code in formats other than `.js` (e.g., TypeScript). This can be achieved by adding a `codeTemplate` variant per output format in the configuration.

### Asynchronous Code Generation

If flow trees grow large enough to cause noticeable delay during synchronous generation, move the processing engine to a Web Worker. The interface remains the same — it becomes a non-blocking call instead of a synchronous one.

---

*End of Document*
