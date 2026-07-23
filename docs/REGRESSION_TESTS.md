# Visual Test Builder — Regression Test Specification

**Author role:** Senior QA Automation Engineer
**Purpose:** lock down every previously fixed defect and high-risk behaviour so it cannot
silently regress. Most tests target the pure engine and state layers and are intended for
**Vitest** automation; a few require the store or the UI. Automation of this suite is
deferred (Phase 5 automates smoke only).

**Fields:** ID · Priority · Area · Layer · Origin · Preconditions · Steps · Expected.
Priority: P0 = blocker, P1 = high. Layer: Unit / Integration / E2E.
Origin: `FIX` = previously fixed defect · `RISK` = high-risk area.

---

## A. String escaping (engine `resolveProps`)

### RT-01 — Single quote in a value
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX (PE-03)
- **Preconditions:** none.
- **Steps:** Generate a `type` node with `selector="#u"`, `value="O'Brien"`.
- **Expected:** Output is `cy.get('#u').type('O\'Brien');`. When the line is evaluated
  against a `cy` mock, the captured argument round-trips to `O'Brien` (valid JS).

### RT-02 — Backslash in a value
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX
- **Preconditions:** none.
- **Steps:** `type` with `value="a\b"` (one backslash).
- **Expected:** The backslash is doubled (`a\\b`); evaluating the line round-trips to
  `a\b`.

### RT-03 — Newline and carriage return in a value
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX
- **Preconditions:** none.
- **Steps:** `type` with `value="l1\nl2\r"`.
- **Expected:** Newline → `\n`, CR → `\r`; the generated line is a single valid statement
  that round-trips to the original string.

### RT-04 — Mixed quotes and backslashes round-trip
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX
- **Preconditions:** none.
- **Steps:** `type` with `value="it's \ \"x\""`.
- **Expected:** The generated line is valid JS and the evaluated argument equals the
  original value exactly.

### RT-05 — Quote inside a selector
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX
- **Preconditions:** none.
- **Steps:** `click` with `selector="a'b"`.
- **Expected:** `cy.get('a\'b').click();`; round-trips to `a'b`.

### RT-06 — Quote inside a visit URL
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX
- **Preconditions:** none.
- **Steps:** `visit` with `url="http://x/y'z"`.
- **Expected:** `cy.visit('http://x/y\'z');`; round-trips to the original URL.

## B. Optional `should()` argument

### RT-07 — `should` with a value
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX (PE-05)
- **Preconditions:** none.
- **Steps:** `should` with `selector="#e"`, `assertion="contain"`, `value="hi"`.
- **Expected:** `cy.get('#e').should('contain', 'hi');`.

### RT-08 — `should` without a value (optional segment dropped)
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** FIX (PE-05)
- **Preconditions:** none.
- **Steps:** `should` with `selector="#e"`, `assertion="be.visible"`, `value=""`.
- **Expected:** `cy.get('#e').should('be.visible');` — no second argument, no `{{value}}`
  placeholder, no dangling comma.

### RT-09 — `should` missing required selector, value empty
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** none.
- **Steps:** `should` with `selector=""`, `assertion="be.visible"`, `value=""`.
- **Expected:** Selector placeholder retained (`cy.get('{{selector}}')`), optional value
  segment still dropped: `cy.get('{{selector}}').should('be.visible');`.

## C. Engine core / HLD §12 / §16

### RT-10 — Full HLD §12 example is byte-exact
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** none.
- **Steps:** Generate the HLD §8 example flow (Login Suite).
- **Expected:** Output equals the HLD §12 block exactly, including 2-space indentation and
  newlines.

### RT-11 — Unknown node becomes a comment; subtree dropped
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** none.
- **Steps:** Generate a flow containing a node with `type="custom-action"`.
- **Expected:** `// [Unknown node: custom-action] — not found in registry`; the node's
  children do not appear.

### RT-12 — Empty required prop retains placeholder
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK (§16)
- **Preconditions:** none.
- **Steps:** `click` with `selector=""`.
- **Expected:** `cy.get('{{selector}}').click();`.

### RT-13 — Empty / null flow returns empty string
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** none.
- **Steps:** Call `processFlow(null)`.
- **Expected:** `""`; never throws.

### RT-14 — Repeated placeholder replaced everywhere
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** A template containing `{{selector}}` twice (fixture registry).
- **Steps:** Generate a node with that template and a set selector.
- **Expected:** All occurrences are replaced (`replaceAll`), not just the first.

### RT-15 — Nested indentation is correct at multiple levels
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** none.
- **Steps:** Generate `describe > it > click` with all props set.
- **Expected:** Each level is indented by one additional 2-space unit; matches the §12
  shape.

## D. State layer / tree mutations

### RT-16 — Delete root empties the flow
- **Priority:** P0 · **Area:** State · **Layer:** Integration · **Origin:** RISK
- **Preconditions:** A flow with a `describe` root.
- **Steps:** Dispatch `deleteNode` for the root id.
- **Expected:** `flow === null`; `generatedCode === ""`.

### RT-17 — Delete the selected node clears selection
- **Priority:** P0 · **Area:** State · **Layer:** Integration · **Origin:** RISK (C-03)
- **Preconditions:** A node is selected.
- **Steps:** Delete that node.
- **Expected:** Node removed; `selectedNodeId === null`.

### RT-18 — Delete an ancestor clears descendant selection
- **Priority:** P0 · **Area:** State · **Layer:** Integration · **Origin:** RISK (C-04)
- **Preconditions:** A deep child is selected.
- **Steps:** Delete an ancestor of the selected node.
- **Expected:** The subtree is removed; `selectedNodeId === null`.

### RT-19 — Reorder downward off-by-one
- **Priority:** P0 · **Area:** State/DnD · **Layer:** Unit · **Origin:** FIX (reorder math)
- **Preconditions:** Children `[A, B, C]`.
- **Steps:** Compute `reorderTargetIndex` for dropping `A` at gap `2`, then `moveNode`.
- **Expected:** Result order `B, A, C` (not `B, C, A`). Verify the full matrix:
  A→gap3 ⇒ `BCA`, C→gap0 ⇒ `CAB`, A→gap0 ⇒ `ABC` (no-op).

### RT-20 — Reorder clamps out-of-range index
- **Priority:** P1 · **Area:** State · **Layer:** Unit · **Origin:** RISK
- **Preconditions:** Children `[A, B, C]`.
- **Steps:** `moveNode(A, toIndex=99)`.
- **Expected:** `A` moves to the last position; no error.

### RT-21 — Cross-parent reorder is rejected
- **Priority:** P0 · **Area:** DnD · **Layer:** Unit · **Origin:** RISK (cross-parent)
- **Preconditions:** Children `[A, B, C]`; a non-member id `Z`.
- **Steps:** `reorderTargetIndex(children, "Z", 1)`.
- **Expected:** Returns `null`; no move dispatched (same-parent rule, HLD §13).

### RT-22 — Update prop on a nonexistent node is a no-op
- **Priority:** P1 · **Area:** State · **Layer:** Integration · **Origin:** RISK (R-01)
- **Preconditions:** A flow exists.
- **Steps:** Dispatch `updateProp` with an id not in the tree.
- **Expected:** Tree unchanged; no phantom node created; code unchanged.

### RT-23 — Derived-code synchronization invariant
- **Priority:** P0 · **Area:** State · **Layer:** Integration · **Origin:** RISK (R-04)
- **Preconditions:** Store initialized.
- **Steps:** Dispatch a long mixed sequence (`addNode`, `updateProp`, `deleteNode`,
  `reorderNode`, `selectNode`). After each, compare `state.generatedCode` to a fresh
  `processFlow(state.flow)`.
- **Expected:** They are equal after every action.

## E. Registry / boot

### RT-24 — Duplicate node type rejected
- **Priority:** P0 · **Area:** Registry · **Layer:** Unit · **Origin:** RISK (RG-01)
- **Preconditions:** Fixture config with two `click` entries.
- **Steps:** Call `createRegistry`.
- **Expected:** Throws `RegistryLoadError` whose `file` is `functions.json`.

### RT-25 — Missing template / allowedChildren rejected
- **Priority:** P0 · **Area:** Registry · **Layer:** Unit · **Origin:** RISK (RG-04/05)
- **Preconditions:** Fixture config: (a) a command without `codeTemplate`; (b) a
  structural node without `allowedChildren`.
- **Steps:** Call `createRegistry` for each.
- **Expected:** Each throws `RegistryLoadError` naming the correct file.

### RT-26 — Registry failure renders the boot error state
- **Priority:** P0 · **Area:** Boot · **Layer:** Integration/E2E · **Origin:** RISK (§16)
- **Preconditions:** A configuration that fails validation.
- **Steps:** Load the app.
- **Expected:** The error state (`role="alert"`) is shown, naming the failing file; the
  canvas does not mount.

## F. IDs and rapid interaction

### RT-27 — UUID generation and fallback
- **Priority:** P0 · **Area:** State · **Layer:** Unit · **Origin:** FIX (UUID fallback)
- **Preconditions:** none.
- **Steps:** (a) With `crypto.randomUUID` available, add many nodes. (b) With
  `crypto.randomUUID` stubbed to `undefined`, add many nodes.
- **Expected:** In both cases every node receives a non-empty id, and all ids within the
  tree are unique; `addNode` never throws.

### RT-28 — Rapid sequential edits stay synchronized
- **Priority:** P1 · **Area:** State · **Layer:** Integration · **Origin:** RISK (PE-09)
- **Preconditions:** A selected node.
- **Steps:** Dispatch 100 `updateProp` actions on the same key in a tight loop.
- **Expected:** The final value is the last dispatched; `generatedCode` reflects it; no
  intermediate desync.

### RT-29 — Rapid sequential drops preserve order
- **Priority:** P1 · **Area:** State/DnD · **Layer:** Integration · **Origin:** RISK (P-02)
- **Preconditions:** An `it` node.
- **Steps:** Dispatch 30 `addNode` actions appending `click` children as fast as possible.
- **Expected:** Exactly 30 children in dispatch order; no lost or duplicated nodes; code
  in sync.

---

## Traceability

| Requested regression area | Test(s) |
|---|---|
| String escaping — O'Brien / backslash / newline | RT-01, RT-02, RT-03, RT-04, RT-05, RT-06 |
| Optional `should()` | RT-07, RT-08, RT-09 |
| Delete root | RT-16 |
| Delete selected node | RT-17 |
| Delete ancestor (descendant selection) | RT-18 |
| Reorder off-by-one | RT-19, RT-20, RT-21 |
| Generated-code synchronization | RT-23 |
| Unknown nodes | RT-11 |
| Registry failure | RT-24, RT-25, RT-26 |
| Required placeholders | RT-09, RT-12 |
| UUID generation | RT-27 |
| Rapid edits | RT-28 |
| Rapid drag-drop | RT-29 |
| HLD §12 correctness | RT-10, RT-15 |

29 regression tests. Most are pure Unit/Integration and deterministic — ideal for Vitest
automation in a follow-up.
