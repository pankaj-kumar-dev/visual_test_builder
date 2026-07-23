# Visual Test Builder — Smoke Test Specification

**Author role:** Senior QA Automation Engineer
**Purpose:** critical happy-path checks that must pass on every build. If any smoke test
fails, the build is rejected without running deeper suites.
**Basis:** the implemented application only. No invented features.

Priority: **P0** = release blocker.
Execution: `ENV` tests run in the terminal; `UI` tests run in the browser (automated as
Cypress in Phase 5).

---

### SM-01 — Production build succeeds
- **Priority:** P0
- **Feature:** Build (ENV)
- **Preconditions:** Dependencies installed (`npm install`).
- **Steps:**
  1. Run `npm run build`.
- **Expected Result:** Build completes with no errors; `dist/` contains `index.html` and
  the JS/CSS assets.
- **Postconditions:** A deployable production bundle exists.

### SM-02 — Type checking passes
- **Priority:** P0
- **Feature:** Typecheck (ENV)
- **Preconditions:** Dependencies installed.
- **Steps:**
  1. Run `npm run typecheck`.
- **Expected Result:** `tsc --noEmit` exits 0 with no type errors.
- **Postconditions:** Source is type-sound.

### SM-03 — Application launches and registry loads
- **Priority:** P0
- **Feature:** Application launch / Registry load (UI)
- **Preconditions:** Valid configuration (default). App served (`npm run dev` or preview).
- **Steps:**
  1. Open the app URL.
- **Expected Result:** The four regions render — palette (`aria-label="Node palette"`),
  canvas (`Flow canvas`), property editor (`Property editor`), output (`Generated code`).
  The startup error state (`role="alert"`, "Configuration failed to load") is **not**
  shown. No uncaught console errors.
- **Postconditions:** App is in its initial empty state; canvas shows the empty prompt.

### SM-04 — Palette renders node chips from the registry
- **Priority:** P0
- **Feature:** Palette (UI)
- **Preconditions:** App launched (SM-03).
- **Steps:**
  1. Inspect the left panel.
- **Expected Result:** A "Structural" group with `Describe Block`, `Test Case`,
  `Before All`, `After All`; a "Commands" group with `Click`, `Type`, `Visit`, `Assert`.
  Every chip is `draggable`.
- **Postconditions:** No state change.

### SM-05 — Create the root node
- **Priority:** P0
- **Feature:** Canvas — palette insertion (UI)
- **Preconditions:** Empty canvas.
- **Steps:**
  1. Drag the `Describe Block` chip onto the empty canvas.
- **Expected Result:** A `Describe Block` node appears as the root; the empty prompt is
  replaced by the tree.
- **Postconditions:** `flow` has a single `describe` root; output panel shows the
  generated `describe(...)` skeleton.

### SM-06 — Build a nested flow (recursive rendering)
- **Priority:** P0
- **Feature:** Canvas — nesting / recursive rendering (UI)
- **Preconditions:** A `describe` root exists (SM-05).
- **Steps:**
  1. Drag `Test Case` onto the `Describe Block` node.
  2. Drag `Type` onto the `Test Case` node.
  3. Drag `Click` onto the `Test Case` node.
- **Expected Result:** The tree renders `describe > it > [type, click]` with correct
  indentation; each level is nested under its parent.
- **Postconditions:** `flow` is a 3-level tree; output reflects the nested structure.

### SM-07 — Select a node
- **Priority:** P0
- **Feature:** Canvas — selection (UI)
- **Preconditions:** A flow with at least one node (SM-06).
- **Steps:**
  1. Click the `Type` node row.
- **Expected Result:** The row is highlighted as selected; the property editor switches
  from the empty prompt to that node's fields.
- **Postconditions:** `selectedNodeId` points to the `type` node.

### SM-08 — Edit a property and see the output update
- **Priority:** P0
- **Feature:** Property editor + Output generation (UI)
- **Preconditions:** The `Type` node is selected (SM-07).
- **Steps:**
  1. Enter `#username` in the `Selector` field.
  2. Enter `admin` in the `Value` field.
- **Expected Result:** As each field changes, the output panel updates in real time; the
  `type` node compiles to `cy.get('#username').type('admin');`.
- **Postconditions:** The node's `props` hold the entered values; no separate save
  required.

### SM-09 — Generated code matches the expected Cypress
- **Priority:** P0
- **Feature:** Output generation correctness (UI)
- **Preconditions:** A fully-filled flow: `describe("Login Suite") > it("Successful
  Login") > type(#username, admin), click(#login)`.
- **Steps:**
  1. Fill all required properties.
  2. Read the output panel.
- **Expected Result:** Output is exactly:
  ```js
  describe('Login Suite', () => {
    it('Successful Login', () => {
      cy.get('#username').type('admin');
      cy.get('#login').click();
    });
  });
  ```
- **Postconditions:** No unresolved-properties warning is shown.

### SM-10 — Copy the generated code
- **Priority:** P0
- **Feature:** Output panel — Copy (UI)
- **Preconditions:** Non-empty generated code (SM-09); secure context (clipboard
  available).
- **Steps:**
  1. Click the `Copy` button.
- **Expected Result:** The button label changes to `Copied!` briefly; the clipboard
  contains the full generated code string.
- **Postconditions:** Button reverts to `Copy`; state unchanged.

### SM-11 — Delete a node
- **Priority:** P0
- **Feature:** Canvas — deletion (UI)
- **Preconditions:** The flow from SM-06; the `Click` node is selected.
- **Steps:**
  1. Click the delete control on the `Click` node (`aria-label="Delete Click"`).
- **Expected Result:** The `Click` node is removed; the output no longer contains its
  line; because it was selected, the property editor returns to the empty prompt.
- **Postconditions:** `flow` no longer contains the node; `selectedNodeId` is cleared.

### SM-12 — Reorder sibling nodes
- **Priority:** P0
- **Feature:** Canvas — reordering (UI)
- **Preconditions:** An `it` node with two command children in a known order
  (e.g. `type` then `click`).
- **Steps:**
  1. Drag the second child to the drop zone above the first child.
- **Expected Result:** The children swap order in the tree; the output lines reorder to
  match.
- **Postconditions:** `flow` children array reflects the new order; code stays in sync.

### SM-13 — Unresolved-properties warning and required indicator
- **Priority:** P0
- **Feature:** Property editor + Output warning (UI)
- **Preconditions:** A `Click` node with an empty required `Selector`.
- **Steps:**
  1. Select the `Click` node and leave `Selector` empty.
  2. Read the property editor and the output panel.
- **Expected Result:** The `Selector` field shows the required indicator and inline
  message; the output panel shows a warning listing the `Click` node; the generated line
  retains the `{{selector}}` placeholder rather than emitting broken code.
- **Postconditions:** Once a valid selector is entered, the warning and placeholder clear.

---

## Coverage of requested smoke areas

| Requested area | Test |
|---|---|
| Application launch | SM-03 |
| Registry load | SM-03 |
| Palette | SM-04 |
| Canvas | SM-05, SM-06 |
| Recursive rendering | SM-06 |
| Property editor | SM-07, SM-08, SM-13 |
| Output generation | SM-08, SM-09 |
| Copy | SM-10 |
| Delete | SM-11 |
| Reorder | SM-12 |
| Build | SM-01 |
| Typecheck | SM-02 |

13 smoke tests, all P0.
