# Visual Test Builder — Negative Test Specification

**Author role:** Senior QA Automation Engineer
**Purpose:** actively try to break the application — invalid input, hostile values,
malformed configuration, extreme scale, and abusive interaction — and assert **graceful
behaviour**: no crash, no state corruption, no invalid-looking success. Where a limitation
is known and accepted, the "Expected" states the honest, documented behaviour rather than
pretending it is handled.

**Fields:** ID · Priority · Area · Layer · Attack · Steps · Expected graceful behaviour.
Priority: P0 = blocker if broken, P1 = high, P2 = medium.

---

## A. Drag-and-drop abuse

### NG-01 — Invalid child dropped into a structural node
- **Priority:** P0 · **Area:** Canvas/DnD · **Layer:** E2E
- **Attack:** Drop a `Click` command directly into a `Describe Block` (which allows only
  `it` / `beforeAll` / `afterAll`).
- **Steps:** Drag `Click` over the `describe` node; observe hover; release.
- **Expected:** The drop zone shows the invalid (red) highlight; the drop is rejected
  silently; no node is added; the tree and generated code are unchanged.

### NG-02 — Drop onto a command (leaf) node
- **Priority:** P1 · **Area:** Canvas/DnD · **Layer:** E2E
- **Attack:** Drop any node onto an existing `Click`.
- **Steps:** Drag a chip over the `click` row; release.
- **Expected:** Rejected (a command has no `allowedChildren`; `getBlock` returns null);
  no child added.

### NG-03 — Drop outside the canvas
- **Priority:** P1 · **Area:** DnD · **Layer:** E2E
- **Attack:** Release a dragged chip over the property or output panel.
- **Steps:** Drag a chip; release outside the canvas region.
- **Expected:** No node created; no error; state unchanged.

### NG-04 — Malformed / foreign drag payload
- **Priority:** P0 · **Area:** DnD · **Layer:** E2E
- **Attack:** Drop an OS file, an image, or selected text onto the canvas.
- **Steps:** Drag external content onto the canvas and nodes.
- **Expected:** `readDragPayload` returns null for the unknown MIME type; nothing is
  inserted; **the browser does not navigate away or open the file** (drop targets call
  `preventDefault`). The working session is preserved.

### NG-05 — Empty drag data
- **Priority:** P1 · **Area:** DnD · **Layer:** Unit
- **Attack:** Fire a drop with an empty `DataTransfer`.
- **Steps:** Call `readDragPayload` with no `DRAG_MIME` data.
- **Expected:** Returns null; the drop handler performs no dispatch.

### NG-06 — Rapid drag start / cancel (stale drag state)
- **Priority:** P1 · **Area:** DnD · **Layer:** E2E
- **Attack:** Start dragging a chip, cancel (ESC / release off-target), immediately start
  another drag; repeat quickly.
- **Steps:** Alternate cancelled and completed drags rapidly.
- **Expected:** Each completed drop validates against the *current* drag; no node created
  by a cancelled drag. **Known consideration:** the transient `activeDrag` holder is
  cleared on `dragend`; if a browser skips `dragend` on an unusual cancel, the next hover
  could mis-validate. Verify per browser; no state corruption results (drop still
  re-reads the real payload).

### NG-07 — Delete a node mid-drag
- **Priority:** P1 · **Area:** DnD/State · **Layer:** E2E
- **Attack:** Begin dragging node A, remove A before dropping, then release on a sibling
  gap.
- **Steps:** As described.
- **Expected:** The drop is a no-op — `reorderTargetIndex` returns null for a non-member
  id; no crash, no ghost move.

## B. Engine / value abuse

### NG-08 — Unknown node type in the flow
- **Priority:** P0 · **Area:** Engine · **Layer:** Unit
- **Attack:** Generate a flow containing `type="not-a-real-node"`.
- **Steps:** Call `processFlow`.
- **Expected:** `// [Unknown node: not-a-real-node] — not found in registry`; the subtree
  is dropped; the function returns a string and never throws.

### NG-09 — Missing required properties
- **Priority:** P0 · **Area:** Engine/Editor · **Layer:** Unit + E2E
- **Attack:** Leave required props empty across several nodes.
- **Steps:** Build a flow with empty `selector` / `label`; read output.
- **Expected:** Each missing value keeps its `{{key}}` placeholder (no broken code); the
  output panel lists the affected nodes; the editor marks the required fields.

### NG-10 — Whitespace-only value treated as empty
- **Priority:** P1 · **Area:** Engine · **Layer:** Unit
- **Attack:** Set a required `selector` to `"   "` (spaces only).
- **Steps:** Generate.
- **Expected:** Treated as empty (`trim()`), so the placeholder is retained rather than
  emitting `cy.get('   ')`.

### NG-11 — Very large input string
- **Priority:** P1 · **Area:** Engine/Editor · **Layer:** E2E
- **Attack:** Paste 100k+ characters into a `value`.
- **Steps:** Enter the huge string; observe editor and output.
- **Expected:** No crash; the value is escaped and included in the output. **Known
  consideration:** generation is synchronous on each keystroke, so very large values may
  introduce visible latency (within HLD §18.8 / §19 expectations).

### NG-12 — Unicode, emoji, RTL, zero-width characters
- **Priority:** P1 · **Area:** Engine/Editor · **Layer:** Unit + E2E
- **Attack:** Enter `🚀`, `日本語`, an RTL override, and zero-width characters into props.
- **Steps:** Enter each; read the tree row and output.
- **Expected:** Preserved verbatim as text; single quotes/backslashes within them are
  escaped; the app does not crash. The tree row may display unusually for RTL/zero-width
  input (cosmetic, not a failure).

### NG-13 — HTML / `<script>` / JavaScript in a value
- **Priority:** P0 · **Area:** Security · **Layer:** E2E
- **Attack:** Enter `<script>alert(1)</script>`, `</code>`, and JS source into props.
- **Steps:** Enter each; inspect the tree, the output block, and the clipboard.
- **Expected:** Everything renders as literal text (React escapes it); nothing executes;
  no `dangerouslySetInnerHTML` path exists. The generated code contains the text as an
  escaped string literal.

### NG-14 — Value containing template tokens
- **Priority:** P2 · **Area:** Engine · **Layer:** Unit
- **Attack:** Set a prop value to `{{children}}` or `{{selector}}`.
- **Steps:** Generate.
- **Expected:** Deterministic output; the function does not crash. **Known consideration:**
  because substitution is sequential, a token typed into one prop may be affected by a
  later substitution pass. Documented as an accepted limitation (not a crash or
  corruption).

## C. Scale abuse

### NG-15 — Very deep tree
- **Priority:** P1 · **Area:** Engine/Rendering · **Layer:** Unit + E2E
- **Attack:** Build a chain thousands of levels deep.
- **Steps:** Nest nodes far beyond the expected 5–6 levels; render and generate.
- **Expected:** Works up to a practical depth. **Known limitation:** both `processFlow`
  and `TreeNode` recurse without a depth guard, so an extreme chain can throw
  `RangeError: Maximum call stack size exceeded`. Graceful expectation: the failure is a
  thrown error at generation/render time — it does not silently corrupt the store or
  produce wrong-but-plausible code. The safe depth ceiling should be recorded.

### NG-16 — Very wide tree
- **Priority:** P1 · **Area:** Rendering · **Layer:** E2E
- **Attack:** Add ~1000 command children under one `it`.
- **Steps:** Bulk-add siblings; interact.
- **Expected:** Renders and generates correctly; no crash. **Known consideration:** ~1000
  siblings create ~1001 `SiblingDropZone` components plus rows and no virtualization (by
  design), so interaction latency is expected at this scale.

### NG-17 — Rapid mixed action burst
- **Priority:** P1 · **Area:** State · **Layer:** Integration
- **Attack:** Fire hundreds of interleaved `addNode` / `updateProp` / `deleteNode` /
  `reorderNode` / `selectNode` actions in a tight loop.
- **Steps:** Dispatch the burst.
- **Expected:** Deterministic final state (Redux is serial); `generatedCode` stays
  synchronized; no exception.

## D. State / selection abuse

### NG-18 — Cross-parent reorder attempt
- **Priority:** P0 · **Area:** State/DnD · **Layer:** Unit
- **Attack:** Attempt to reorder a node into a different parent's sibling list.
- **Steps:** Provide a `SiblingDropZone` for parent X and a move payload for a child of
  parent Y.
- **Expected:** `isSibling` is false / `reorderTargetIndex` returns null; no move
  dispatched (same-parent rule, HLD §13).

### NG-19 — Reorder / update with a stale (deleted) node id
- **Priority:** P1 · **Area:** State · **Layer:** Integration
- **Attack:** Delete a node, then dispatch `reorderNode` and `updateProp` for its id.
- **Steps:** As described.
- **Expected:** Both are no-ops; the tree is unchanged; code stays in sync; no phantom
  node is created.

### NG-20 — Select a nonexistent node id
- **Priority:** P1 · **Area:** State/Editor · **Layer:** Integration + E2E
- **Attack:** Dispatch `selectNode("does-not-exist")`.
- **Steps:** As described.
- **Expected:** `findNode` returns null; the property editor shows its empty prompt; no
  crash.

## E. Configuration abuse

### NG-21 — Invalid configuration (duplicate / missing field / malformed)
- **Priority:** P0 · **Area:** Registry/Boot · **Layer:** Unit + Integration
- **Attack:** (a) duplicate node type; (b) missing `codeTemplate`; (c) missing
  `allowedChildren`; (d) malformed JSON.
- **Steps:** Apply each and boot / call `createRegistry`.
- **Expected:** (a)–(c) throw `RegistryLoadError` naming the file; on boot the error state
  is shown and the canvas does not mount. (d) fails the bundled import / is caught by the
  boot `try/catch` and shown as an error state — never a blank screen.

### NG-22 — Empty configuration arrays
- **Priority:** P2 · **Area:** Registry · **Layer:** Integration
- **Attack:** Set `building-blocks.json` and `functions.json` to `[]`.
- **Steps:** Boot.
- **Expected:** App loads with empty palette groups; nothing can be created; no crash. A
  degenerate-but-valid state, not an error.

## F. Environment abuse

### NG-23 — Copy in an insecure context
- **Priority:** P2 · **Area:** Output · **Layer:** E2E
- **Attack:** Serve over plain HTTP (no `navigator.clipboard`) and click Copy.
- **Steps:** As described.
- **Expected:** No crash. **Known consideration:** `handleCopy` guards the missing API and
  returns silently, so the button appears to do nothing (no feedback). Documented; pairs
  with the UUID fallback for insecure-context deployments.

---

## Traceability

| Requested negative area | Test(s) |
|---|---|
| Invalid drop | NG-01, NG-02, NG-03 |
| Unknown node | NG-08 |
| Malformed drag payload | NG-04, NG-05 |
| Missing props | NG-09, NG-10 |
| Huge input | NG-11 |
| Unicode | NG-12 |
| Deep trees | NG-15 |
| Rapid interactions | NG-06, NG-17 |
| Invalid config | NG-21, NG-22 |
| Cross-parent reorder | NG-18 |
| Unexpected property values | NG-10, NG-12, NG-13, NG-14 |

23 negative tests. Items flagged **Known limitation / Known consideration** reflect the
accepted, documented behaviour recorded in `MANUAL_TEST_PLAN.md` (Post-Triage Resolution).
