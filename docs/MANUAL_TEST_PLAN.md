# Visual Test Builder — Destructive Manual Test Plan

**Author role:** Senior QA + Frontend Reviewer
**Goal:** break the application — crash it, corrupt state, expose edge cases, violate
assumptions. Not a happy-path verification.

**Legend for Possible Failure:** severity in brackets — [BLOCKER], [HIGH], [MED], [LOW].
Items marked **(code-confirmed)** are weaknesses visible in the current source, not
hypothetical.

---

## Post-Triage Resolution

The following release-triage fixes have been applied and verified (typecheck, build,
round-trip execution of generated code):

- **PE-03 / Compiler #7 — string escaping (was [HIGH]): FIXED.** Prop values are now
  escaped for their single-quoted string context in `resolveProps`
  (`escapeSingleQuoted`). Quotes, backslashes, and newlines produce valid Cypress;
  arguments round-trip when the generated line is evaluated.
- **PE-05 / Compiler #7 — should() optional value (was [HIGH]): FIXED.** The engine now
  supports optional template segments `[[key: … ]]`; the `should` template drops the
  value argument entirely when empty (`should('be.visible')`), leaving no placeholder.
- **B-06 / O-03 — crypto.randomUUID in insecure contexts (was [HIGH]): FIXED.**
  `generateId()` falls back to a timestamp+random id when `crypto.randomUUID` is
  unavailable. Uniqueness is tree-local (HLD §18.3).

The remaining items below are retained as **accepted known limitations / implementation
considerations** — they are intentional scope decisions or low-severity, and were not
changed to avoid altering working architecture:

- Unbounded recursion depth (C-01, E-03, RR-02) — no depth guard; HLD §18.8 bounds
  expected depth to 5–6.
- Prop values containing literal `{{token}}` sequences (PE-04) — treated verbatim; may
  interact with later substitution. Deterministic.
- Shallow config validation (RG-01..06) — no cross-reference of `allowedChildren`,
  prop-type whitelist, or command→props-entry check.
- Synchronous full-tree regeneration on every edit (PERF-01) — acceptable within HLD
  §18.8 / §19; first candidate for a Web Worker (HLD §20) if scale grows.
- Unrestricted root drop (C-09) and cross-browser DnD parity (BR-01) — behavioural
  notes, not defects.

---

## Section 1 — Application Boot

### B-01 — Duplicate node type in configuration
- **Objective:** Registry rejects duplicate ids and app renders a named error state.
- **Preconditions:** Edit `functions.json` to add a second `{ "type": "click" }`.
- **Steps:** Rebuild, load app.
- **Expected:** Startup error state; message names `functions.json`; canvas never mounts.
- **Possible Failure:** [HIGH] If build strips it or the error is swallowed, a silent
  Map overwrite ships. Confirm `RegistryLoadError.file` is displayed.
- **Why it matters:** Config is the product surface; silent overwrite hides a real bug.

### B-02 — Missing `codeTemplate`
- **Objective:** Boot fails loudly when a node has no template.
- **Preconditions:** Remove `codeTemplate` from a `functions.json` entry.
- **Steps:** Rebuild, load.
- **Expected:** `RegistryLoadError` naming `functions.json`; error screen.
- **Possible Failure:** [HIGH] If validation misses it, the engine later reads
  `def.codeTemplate` as `undefined` → `undefined.replaceAll` throws at generation time,
  far from the cause.
- **Why it matters:** Late, misattributed crash vs early, named failure.

### B-03 — Missing `allowedChildren` on a structural node
- **Objective:** Structural node without nesting rules is rejected at boot.
- **Preconditions:** Remove `allowedChildren` from `describe` in `building-blocks.json`.
- **Steps:** Rebuild, load.
- **Expected:** `RegistryLoadError` naming `building-blocks.json`.
- **Possible Failure:** [MED] If it passes, `canDropInto` reads `.includes` on
  `undefined` → drop handler throws mid-drag.
- **Why it matters:** Drag-time crash is hard to reproduce and report.

### B-04 — Malformed JSON
- **Objective:** Corrupt config does not produce a blank screen.
- **Preconditions:** Introduce a syntax error in any config file.
- **Steps:** Rebuild/serve.
- **Expected:** Build fails (bundled import), or at runtime the boot `try/catch` renders
  the error state.
- **Possible Failure:** [MED] White screen with only a console error.
- **Why it matters:** Operability — a named failure beats a blank page.

### B-05 — Empty config arrays
- **Objective:** App tolerates empty `building-blocks.json` / `functions.json` (`[]`).
- **Preconditions:** Set both to `[]`.
- **Steps:** Load; observe palette and canvas.
- **Expected:** Palette shows empty groups; canvas usable but nothing can be created.
- **Possible Failure:** [LOW] Crash iterating empty registry; or a confusing dead UI
  with no explanation.
- **Why it matters:** Degenerate-but-valid config should not crash.

### B-06 — `crypto.randomUUID` unavailable (insecure context)
- **Objective:** Node creation in a non-secure context (plain HTTP, non-localhost).
- **Preconditions:** Serve the production build over plain `http://<lan-ip>`.
- **Steps:** Drag any node onto the canvas.
- **Expected:** Node is created.
- **Possible Failure:** [HIGH] **(code-confirmed)** `addNode.prepare` calls
  `crypto.randomUUID()`, which is only defined in secure contexts. In insecure contexts
  it is `undefined` → `TypeError` on every add → the tool is unusable and the error is
  cryptic.
- **Why it matters:** Real deployment surfaces (internal HTTP hosts) silently brick the
  core action.

---

## Section 2 — Palette

### P-01 — Drag every node type
- **Objective:** All 8 chips are draggable and carry the correct type.
- **Steps:** Drag each of `describe/it/beforeAll/afterAll/click/type/visit/should` onto
  a valid target.
- **Expected:** Each creates the correct node.
- **Possible Failure:** [LOW] A chip missing `draggable` or wrong drag payload.
- **Why it matters:** Baseline of the whole tool.

### P-02 — Rapid repeated drags
- **Objective:** Fast repeated palette drops do not corrupt state.
- **Steps:** Drop `click` into an `it` ~30 times as fast as possible.
- **Expected:** 30 children in order; code stays in sync.
- **Possible Failure:** [LOW] Lost/duplicated nodes if a drag payload leaks between
  gestures (see `activeDrag` global).
- **Why it matters:** Real users drag quickly.

### P-03 — Cancel drag (ESC / release off any target)
- **Objective:** Cancelled drag leaves no residue.
- **Steps:** Start dragging a chip, press ESC or release over the palette.
- **Expected:** No node created; no highlight stuck; next drag behaves normally.
- **Possible Failure:** [MED] **(code-confirmed risk)** `activeDrag` is cleared in
  `onDragEnd`. If a browser skips `dragend` on an unusual cancel, `activeDrag` remains
  set and the next hover mis-validates.
- **Why it matters:** Stale transient DnD state causes intermittent, unreproducible bugs.

### P-04 — Drag outside the window / to another app
- **Objective:** Dragging out and back does not break state.
- **Steps:** Drag a chip off the browser window, return, release on canvas.
- **Expected:** Either a clean drop or a clean no-op; no stuck highlight.
- **Possible Failure:** [MED] `dragend` not firing → stale `activeDrag`.
- **Why it matters:** Multi-monitor / windowed workflows are common.

### P-05 — Drag an unsupported payload onto the canvas
- **Objective:** Dropping a file, image, selected text, or link is ignored safely.
- **Steps:** Drag a file from the OS onto canvas/nodes.
- **Expected:** No node created; the browser does not navigate to / open the file.
- **Possible Failure:** [MED] If a drop target does not `preventDefault`, the browser
  navigates away and the session is lost. `readDragPayload` returns null for foreign
  MIME, but default-navigation must still be suppressed on every drop target.
- **Why it matters:** Accidental file drops must never destroy the working session.

---

## Section 3 — Canvas

### C-01 — 100+ nested nodes (deep chain)
- **Objective:** Deeply nested tree renders and generates.
- **Preconditions:** Build a chain `describe > it > ...` nested as deep as the UI allows.
- **Steps:** Keep nesting; watch render and output.
- **Expected:** Renders; code generates.
- **Possible Failure:** [MED] **(code-confirmed risk)** Both `TreeNode` and
  `processFlow` recurse without a depth guard. Thousands of levels → `RangeError:
  Maximum call stack size exceeded`. HLD §18.8 assumes ≤5–6 levels but nothing enforces
  it.
- **Why it matters:** Unbounded recursion is a latent crash; confirm the practical limit.

### C-02 — Delete root
- **Objective:** Deleting the root empties the canvas cleanly.
- **Steps:** Select root, delete.
- **Expected:** `flow → null`, empty state shown, `generatedCode → ""`.
- **Possible Failure:** [LOW] Stale render or non-empty code.
- **Why it matters:** Root deletion is a boundary in `removeNode`.

### C-03 — Delete the selected node
- **Objective:** Selection is cleared when its node is removed.
- **Steps:** Select a leaf, delete it.
- **Expected:** Node gone; property editor returns to empty state.
- **Possible Failure:** [MED] Dangling `selectedNodeId` → editor tries to render a
  missing node.
- **Why it matters:** Selection/flow desync corrupts the right panel.

### C-04 — Delete an ancestor of the selected node
- **Objective:** Deleting a subtree that contains the selection clears selection.
- **Steps:** Select a deep child, then delete its grandparent.
- **Expected:** Whole subtree removed; selection cleared.
- **Possible Failure:** [MED] Selection points into a removed subtree; editor renders
  nothing or throws.
- **Why it matters:** This is beyond the literal HLD text; confirm the implemented guard
  (`findNode` after removal) actually fires.

### C-05 — Delete while dragging
- **Objective:** Deleting a node mid-drag does not crash.
- **Steps:** Begin dragging node A; before dropping, delete A via keyboard-driven flow
  or a second pointer if possible; release.
- **Expected:** No crash; drop is a no-op because A is no longer a sibling.
- **Possible Failure:** [MED] **(code-confirmed mitigation)** `SiblingDropZone` re-checks
  `isSibling` and `reorderTargetIndex` returns null for a missing node, so the drop
  should no-op. Verify no exception and no ghost move.
- **Why it matters:** Concurrent delete + drop is a classic state race.

### C-06 — Drop outside the canvas
- **Objective:** Dropping in the palette/property/output regions does nothing.
- **Steps:** Drag a chip, release over the right or bottom panel.
- **Expected:** No node created.
- **Possible Failure:** [LOW] Unexpected insert if a non-canvas region accepts drops.
- **Why it matters:** Only the canvas and its nodes are drop targets.

### C-07 — Drop onto a command node
- **Objective:** Commands are leaves; they reject children.
- **Steps:** Drop `click` onto an existing `click`.
- **Expected:** Red invalid highlight; drop rejected.
- **Possible Failure:** [LOW] Child added under a command → invalid nesting.
- **Why it matters:** `getBlock` returns null for commands; `canDropInto` must return
  false.

### C-08 — Drop an invalid child into a structural node
- **Objective:** `allowedChildren` is enforced.
- **Steps:** Drop `click` directly into `describe` (allows `it/beforeAll/afterAll` only).
- **Expected:** Red highlight; drop rejected.
- **Possible Failure:** [HIGH] If enforcement is missing, an `it`-only command lands
  under `describe` and generates malformed structure.
- **Why it matters:** This is the core validation rule (HLD §13).

### C-09 — Command node as root
- **Objective:** Behaviour when the first node dropped is a command.
- **Steps:** On an empty canvas, drop `click` as the root.
- **Expected:** Defined behaviour (node created; it is a leaf with no children allowed).
- **Possible Failure:** [MED] **(code-confirmed)** Root drop is unrestricted, so a
  command can be root. It becomes a dead single node (nothing can nest in it) and
  generates a bare `cy.get(...)` with no `describe/it`. Confirm this is acceptable or
  intended to be blocked.
- **Why it matters:** Produces technically valid but structurally meaningless output.

### C-10 — Rapid drag / rapid delete / rapid reorder / repeated reorder
- **Objective:** Bursts of structural actions keep the tree and code consistent.
- **Steps:** Add 10 siblings; reorder them back and forth 20 times; delete 5 rapidly.
- **Expected:** Order and code always match the visible tree.
- **Possible Failure:** [MED] Off-by-one on reorder, or code/tree desync under bursts.
- **Why it matters:** Reorder index math (`reorderTargetIndex` + `moveNode`) is subtle.

---

## Section 4 — Property Editor

### PE-01 — Empty required values
- **Objective:** Clearing a required field surfaces the indicator and warning.
- **Steps:** Clear `selector` on a `click`.
- **Expected:** Red field + inline "required"; output panel lists the node; generated
  code retains `{{selector}}`.
- **Possible Failure:** [LOW] Indicator and code disagree.
- **Why it matters:** The two §16 mechanisms must stay consistent.

### PE-02 — Very long strings (100k chars)
- **Objective:** Large values do not freeze the editor or generation.
- **Steps:** Paste 100k characters into `value`.
- **Expected:** Editor and output remain responsive.
- **Possible Failure:** [LOW] Synchronous regeneration on each keystroke lags.
- **Why it matters:** Generation runs on every change (HLD §14).

### PE-03 — Single quote / value that breaks the string literal
- **Objective:** A value containing `'` or `\` or a newline.
- **Steps:** Set `value` to `O'Brien` or `line1\nline2` or `a\b`.
- **Expected (documented behaviour):** The value is inserted verbatim.
- **Possible Failure:** [HIGH] **(code-confirmed)** Prop values are interpolated into the
  template **without escaping**. `O'Brien` produces
  `cy.get('#u').type('O'Brien');` — syntactically broken Cypress. This is a real
  compiler-correctness gap: the generated code is not guaranteed valid for arbitrary
  input.
- **Why it matters:** The stated goal is "syntactically correct Cypress code"; unescaped
  quotes/backslashes/newlines violate it.

### PE-04 — Value containing template tokens
- **Objective:** A prop value like `{{children}}` or `{{selector}}`.
- **Steps:** Set `selector` to `{{children}}`.
- **Expected (documented behaviour):** Treated as literal text.
- **Possible Failure:** [MED] **(code-confirmed)** After a prop is substituted, later
  `replaceAll('{{children}}', ...)` (and other keys) will scan the injected value and
  substitute into user data — a template-injection edge. Deterministic but surprising.
- **Why it matters:** User input can perturb the compiler's own tokens.

### PE-05 — `should` with empty optional `value`
- **Objective:** Assertion that needs no value (e.g. `be.visible`).
- **Steps:** Add `should`, set `assertion = be.visible`, leave `value` empty.
- **Expected (documented behaviour):** —
- **Possible Failure:** [HIGH] **(code-confirmed)** Template is
  `should('{{assertion}}', '{{value}}')`. Empty `value` is retained as a placeholder,
  producing `should('be.visible', '{{value}}')` — invalid. The naive single-token engine
  cannot omit an optional argument. Confirm this is an accepted limitation.
- **Why it matters:** The most common assertion produces broken output by default.

### PE-06 — Unicode, emoji, RTL, control characters
- **Objective:** Non-ASCII input is preserved and safe.
- **Steps:** Enter `🚀`, `日本語`, `‮`, zero-width chars into `value`.
- **Expected:** Rendered and generated as text; no layout break in the tree row.
- **Possible Failure:** [LOW] RTL/zero-width chars distort the row label.
- **Why it matters:** Text handling robustness.

### PE-07 — HTML / `<script>` / JS / SQL-like strings
- **Objective:** Markup and code are inert in the app.
- **Steps:** Enter `<script>alert(1)</script>`, `"; DROP TABLE`, `</code>`.
- **Expected:** Displayed and generated as literal text (React escapes it).
- **Possible Failure:** [LOW] Any DOM execution would be critical, but React text nodes
  prevent it. Verify no `dangerouslySetInnerHTML` exists.
- **Why it matters:** Confirms no injection surface in the app itself.

### PE-08 — Change selection while typing
- **Objective:** Switching nodes mid-edit commits correctly.
- **Steps:** Type into a field, then click another node without blurring.
- **Expected:** The typed value is already committed (change dispatches immediately);
  new node's fields load.
- **Possible Failure:** [LOW] Lost keystroke or value written to the wrong node.
- **Why it matters:** Fields are controlled by the store with no local buffer.

### PE-09 — Rapid typing
- **Objective:** Fast typing keeps output synced.
- **Steps:** Hold keys / paste rapidly into `selector`.
- **Expected:** Final value matches; code matches final value.
- **Possible Failure:** [LOW] Dropped updates.
- **Why it matters:** Every keystroke dispatches and regenerates.

---

## Section 5 — Processing Engine

### E-01 — Unknown node type
- **Objective:** Unknown types never crash; become comments.
- **Steps:** Load a flow (via store) containing `type: "custom"`.
- **Expected:** `// [Unknown node: custom] — not found in registry`; subtree dropped.
- **Possible Failure:** [LOW] Crash on `def.codeTemplate` for null def.
- **Why it matters:** Core resilience contract (HLD §16). Verified in dev; re-confirm.

### E-02 — Missing template / missing property / null children / empty flow
- **Objective:** Engine always returns a string, never throws.
- **Steps:** Exercise: node with no `props`, node with `children: undefined`,
  `flow = null`.
- **Expected:** Empty string for null; placeholders retained for missing props; no throw.
- **Possible Failure:** [MED] `undefined` template (only possible if B-02 slips through)
  → `undefined.replaceAll` throws.
- **Why it matters:** Engine purity/robustness is the compiler's guarantee.

### E-03 — Very deep tree
- **Objective:** Stack behaviour under depth.
- **Steps:** Programmatically build a 5,000-level chain and call generation.
- **Expected (realistic):** Works to some depth, then `RangeError`.
- **Possible Failure:** [MED] **(code-confirmed)** No depth guard in `generateNode`.
- **Why it matters:** Establish and document the safe depth ceiling.

### E-04 — Repeated placeholders in a template
- **Objective:** A template referencing `{{selector}}` twice fills both.
- **Steps:** Temporarily craft such a template in config; generate.
- **Expected:** All occurrences replaced (`replaceAll`).
- **Possible Failure:** [LOW] Only first replaced (would be a bug if `.replace` were used
  — it is not).
- **Why it matters:** Confirms the deliberate `replaceAll` choice holds.

### E-05 — Determinism
- **Objective:** Same flow always yields identical output.
- **Steps:** Generate the same tree repeatedly.
- **Expected:** Byte-identical strings.
- **Possible Failure:** [LOW] Any nondeterminism (there should be none — no Date/random).
- **Why it matters:** Reproducible output is a compiler requirement.

---

## Section 6 — Redux

### R-01 — Update then delete / delete then update
- **Objective:** Ordering of prop update and delete stays consistent.
- **Steps:** Update a node's prop, delete it; then attempt an update on the deleted id.
- **Expected:** Update on a missing id is a safe no-op; code stays synced.
- **Possible Failure:** [LOW] **(code-confirmed mitigation)** `updateNodeProps` returns
  the same tree when the id is absent; verify no phantom node is created.
- **Why it matters:** Actions can arrive for stale ids.

### R-02 — Move a deleted node
- **Objective:** Reorder targeting a removed node.
- **Steps:** Delete a node, dispatch `reorderNode` with its id.
- **Expected:** No-op (`moveNode` finds nothing).
- **Possible Failure:** [LOW] Tree corruption.
- **Why it matters:** DnD can outlive the node.

### R-03 — Select a nonexistent node
- **Objective:** Selecting an unknown id does not crash the editor.
- **Steps:** Dispatch `selectNode('does-not-exist')`.
- **Expected:** `findNode` returns null; editor shows the empty state.
- **Possible Failure:** [LOW] Editor throws on a null node.
- **Why it matters:** Selection is a raw string; nothing guarantees it exists.

### R-04 — `generatedCode` synchronization invariant
- **Objective:** `generatedCode === processFlow(flow)` after every action.
- **Steps:** After a long random sequence of all five actions, compare the stored code to
  a fresh `processFlow(flow)`.
- **Expected:** Always equal.
- **Possible Failure:** [MED] Any action path that mutates flow without calling
  `applyFlow` would desync. (Currently all flow-mutating reducers route through
  `applyFlow`; `selectNode` intentionally does not touch flow.)
- **Why it matters:** The derived-state guarantee is central to HLD §14.

### R-05 — Rapid mixed dispatch burst
- **Objective:** A burst of interleaved actions stays consistent.
- **Steps:** Fire 500 mixed actions in a tight loop.
- **Expected:** Deterministic final state; code synced.
- **Possible Failure:** [LOW] JS is single-threaded and Redux serial, so no true race;
  confirm no accidental async.
- **Why it matters:** Rules out hidden async in the state path.

---

## Section 7 — Recursive Rendering

### RR-01 — Very wide tree
- **Objective:** Hundreds of siblings render and reorder.
- **Steps:** Add 500 commands under one `it`.
- **Expected:** Renders; interaction remains usable.
- **Possible Failure:** [MED] 500 siblings ⇒ ~501 `SiblingDropZone` components plus rows;
  interaction lag. No virtualization (by design).
- **Why it matters:** Width multiplies drop-zone components.

### RR-02 — Very deep tree render
- **Objective:** See C-01/E-03 from the render side.
- **Possible Failure:** [MED] Render recursion stack overflow.

### RR-03 — Selection thrash
- **Objective:** Rapidly changing selection does not leak renders.
- **Steps:** Click many nodes quickly.
- **Expected:** Only the previously and newly selected rows re-render (scalar selector).
- **Possible Failure:** [LOW] Whole-tree re-render on each selection if the selector were
  coarse (it is `state.selectedNodeId === node.id`, so it should be minimal).
- **Why it matters:** Confirms the render-cost claim.

### RR-04 — Key stability under reorder
- **Objective:** Reordering does not remount whole subtrees.
- **Steps:** Reorder siblings; watch for lost input focus / flicker.
- **Expected:** Stable `key={child.id}` preserves identity.
- **Possible Failure:** [LOW] Focus loss or state reset if keys were index-based (they are
  id-based).
- **Why it matters:** Correct keys prevent subtle DnD/edit bugs.

---

## Section 8 — Registry

### RG-01..RG-06 — Boot-time validation matrix
- **Objective:** Each malformed config shape fails at boot with a named file.
- **Cases:** unknown type referenced in `allowedChildren`; duplicate ids; missing schema
  entry in `function-props.json`; missing template; missing `allowedChildren`; invalid
  prop `type` (e.g. `"number"`).
- **Steps:** Apply each mutation, rebuild, load.
- **Expected:** `getBlock/getFunction` return null for unknown; duplicates and missing
  template/type/allowedChildren throw `RegistryLoadError`.
- **Possible Failure:** [MED] **(code-confirmed gaps)** Validation checks presence of
  `type`, `codeTemplate`, `allowedChildren`, and duplicates — but it does **not** verify
  that every `allowedChildren` entry references a real node, nor that `PropDef.type` is a
  known value, nor that each command has a `function-props.json` entry. An
  `allowedChildren` pointing at a nonexistent type silently yields a rule that never
  matches; an unknown prop `type` falls through `PropertyField` to a text input.
- **Why it matters:** Config authors get no signal for these mistakes.

---

## Section 9 — Output Panel

### O-01 — Copy empty output
- **Objective:** Copy is disabled / safe when there is no code.
- **Steps:** On empty canvas, attempt copy.
- **Expected:** Button disabled; nothing copied.
- **Possible Failure:** [LOW] Copying an empty string silently.
- **Why it matters:** Avoids confusing "copied nothing" UX.

### O-02 — Copy huge output
- **Objective:** Copying a very large program works.
- **Steps:** Build a large tree; copy.
- **Expected:** Full text on the clipboard.
- **Possible Failure:** [LOW] Clipboard size limits / truncation.
- **Why it matters:** Large real suites.

### O-03 — Copy in an insecure context
- **Objective:** Copy behaviour without `navigator.clipboard`.
- **Steps:** Serve over plain HTTP; click Copy.
- **Expected:** No crash.
- **Possible Failure:** [MED] **(code-confirmed)** `handleCopy` guards
  `!navigator.clipboard` and returns silently — the button appears to do nothing with no
  feedback. Acceptable but worth noting alongside B-06.
- **Why it matters:** Insecure-context deployments degrade quietly.

### O-04 — Update while copying / warning consistency
- **Objective:** Editing during the "Copied!" window stays consistent.
- **Steps:** Copy, then immediately edit a prop.
- **Expected:** Code and warning update; "Copied!" reverts after its timeout.
- **Possible Failure:** [LOW] Stale "Copied!" label; unresolved list out of date.
- **Why it matters:** The warning is recomputed each render from the live flow.

---

## Section 10 — Performance

### PERF-01 — 100 / 500 / 1000 nodes
- **Objective:** Measure interaction latency at scale.
- **Steps:** Build trees of 100, 500, 1000 nodes; time an edit, a drop, a reorder.
- **Expected:** Usable at 100; degradation measured and documented at 500–1000.
- **Possible Failure:** [MED] Each keystroke runs synchronous full-tree
  `processFlow` **and** `findUnresolvedNodes` (two O(n) traversals) plus a full canvas
  re-render. No memoization (by design). Expect visible lag at 500+.
- **Why it matters:** Establish the practical ceiling and confirm it matches HLD §18.8 /
  §19 (synchronous generation "may need to be revisited").

### PERF-02 — Repeated edits / repeated drag-drop
- **Objective:** Sustained activity does not degrade over time.
- **Steps:** Perform 1,000 edits; watch memory and responsiveness in DevTools.
- **Expected:** Flat memory; no progressive slowdown.
- **Possible Failure:** [LOW] Growth from retained closures/timeouts.
- **Why it matters:** Leak detection (see leaks summary).

---

## Section 11 — React

### RX-01 — StrictMode double invocation
- **Objective:** Double-invoked renders/effects are harmless.
- **Steps:** Run dev build (StrictMode on); exercise all panels.
- **Expected:** No duplicated side effects; reducers/engine pure; `getRegistry` memoized.
- **Possible Failure:** [LOW] Any impurity would surface here.
- **Why it matters:** Confirms purity in practice.

### RX-02 — Console cleanliness
- **Objective:** No errors or warnings during normal and destructive use.
- **Steps:** Keep the console open through the full plan.
- **Expected:** No key warnings, no controlled/uncontrolled input warnings, no act()
  warnings.
- **Possible Failure:** [LOW] Uncontrolled `select` if `value` ever becomes `undefined`
  (guarded by `?? ''`).
- **Why it matters:** Console noise hides real regressions.

### RX-03 — `setTimeout` after unmount
- **Objective:** The Copy timeout does not warn.
- **Steps:** Copy, then... (OutputPanel never unmounts in this app).
- **Expected:** No "setState on unmounted component".
- **Possible Failure:** [LOW] Only if the panel could unmount; currently it cannot.
- **Why it matters:** Documents a latent risk if layout changes later.

---

## Section 12 — Browser / Environment

### BR-01 — Chrome / Firefox / Edge
- **Objective:** DnD parity across engines.
- **Steps:** Run Sections 2–3 in each browser.
- **Expected:** Consistent drop validation and reordering.
- **Possible Failure:** [MED] `dragend`/`dragover` timing differs; Firefox requires
  `dataTransfer.setData` for drags to start (present) — verify highlights and
  `activeDrag` cleanup behave identically.
- **Why it matters:** Native DnD is the least portable browser API.

### BR-02 — Window resize / zoom / OS dark mode
- **Objective:** Layout holds; no functional break.
- **Steps:** Resize narrow, zoom to 200%/50%, toggle OS dark mode.
- **Expected:** Grid stays usable; panels scroll. Dark mode: the app uses a light theme
  (no theme support by design) — must remain legible.
- **Possible Failure:** [LOW] Fixed column widths crowd the canvas at small sizes.
- **Why it matters:** Basic environmental robustness.

---

## Section 13 — Security

### SEC-01 — Paste HTML / JS / CSS / `<script>` / JSON into fields
- **Objective:** No execution; values stay text end-to-end.
- **Steps:** Paste each into props; inspect the tree row, the generated code, and the
  copied clipboard content.
- **Expected:** Everything is literal text; React escapes all display; the clipboard
  contains the exact generated string.
- **Possible Failure:** [LOW] App-side execution would be critical; none expected (no
  `dangerouslySetInnerHTML`, no `eval`). **Note:** the *generated code* can be made
  syntactically broken by unescaped quotes (PE-03) — a correctness issue, not an app XSS.
- **Why it matters:** Separates "app is safe" (yes) from "output is always valid" (no).

---

## Section 14 — Architecture Validation

### A-01 — Registry is the single source of truth
- **Check:** Grep the codebase — only `registry/index.ts` imports the config JSON; no UI
  or engine module imports `*.json` directly.
- **Possible Failure:** [MED] Any direct JSON import elsewhere breaks the dependency rule.

### A-02 — Processing engine stays pure
- **Check:** `engine/` imports no React/Redux; no side effects; deterministic.
- **Possible Failure:** [MED] A stray store/DOM import.

### A-03 — Redux owns application state
- **Check:** No component holds flow/selection in local state; only transient UI state
  (`copied`, drop-hover) is local.
- **Possible Failure:** [LOW] A shadow copy of flow in a component.

### A-04 — Canvas owns no business logic
- **Check:** Tree mutations happen only in `state/`; canvas dispatches and applies UI drop
  rules (`dropRules.ts`) only.
- **Possible Failure:** [LOW] Insert/delete/reorder logic leaking into components.

### A-05 — Property editor owns no schema
- **Check:** Schema comes from the registry; the editor only renders it.
- **Possible Failure:** [LOW] Hardcoded field lists.

### A-06 — Output panel is read-only
- **Check:** No editable output; code is derived, not stored authoritatively beyond the
  derived `generatedCode`.
- **Possible Failure:** [LOW] Any writable output control.

---

# Reviewer Summary — Weaknesses Before Production

## 1. Potential crash scenarios
- **Unbounded recursion** in `processFlow` and `TreeNode` — deep trees → `RangeError`.
  No depth guard. [MED]
- **`crypto.randomUUID` undefined** in insecure contexts → every `addNode` throws.
  [HIGH]
- **Malformed template slipping past validation** (`undefined.replaceAll`) if B-02/B-03
  guards are ever weakened. [MED]

## 2. Potential race conditions
- **Stale `activeDrag`** (module-global transient DnD state) if `dragend` is missed on an
  unusual cancel or cross-window drag → next hover mis-validates. Serial JS prevents true
  data races, but this transient-state staleness is the closest thing. [MED]
- Delete-during-drag is mitigated (sibling re-check + null target), but must be verified
  per browser. [MED]

## 3. Potential memory leaks
- **Copy `setTimeout`** is harmless today (panel never unmounts); becomes a leak/warning
  if the layout is ever made conditional. [LOW]
- No subscriptions, intervals, or listeners are retained elsewhere. Immutable tree
  helpers reuse references and do not accumulate. [LOW]

## 4. Potential React rendering issues
- **No memoization**: every prop keystroke triggers two full-tree traversals plus a full
  canvas re-render — visible lag at 500–1000 nodes. Intentional per scope, but the
  ceiling must be documented. [MED]
- Wide trees create many `SiblingDropZone` instances (no virtualization, by design).
  [MED]
- Keys are id-based (good); selection uses a scalar selector (good).

## 5. Potential Redux issues
- The **derived-code invariant** holds only because every flow-mutating reducer routes
  through `applyFlow`. Any future reducer that forgets this silently desyncs
  `generatedCode`. Worth a guard/test. [MED]
- No-op actions on stale ids are safe but still run a full regeneration. [LOW]

## 6. Potential drag-and-drop bugs
- Root drop is unrestricted → a command can become a meaningless root. [MED]
- Foreign payload drops rely on every target calling `preventDefault`; verify no gap lets
  the browser navigate on a file drop. [MED]
- Cross-browser `dragend`/highlight cleanup parity (Firefox/Edge). [MED]

## 7. Potential compiler (engine) bugs
- **No escaping of interpolated prop values** — quotes, backslashes, and newlines produce
  syntactically invalid Cypress (`type('O'Brien')`). Directly contradicts the "correct
  Cypress code" goal. **Highest-value defect to discuss before release.** [HIGH]
- **`should` with empty optional value** emits `should('be.visible', '{{value}}')` —
  invalid. The single-token template model cannot omit optional args. [HIGH]
- **User-supplied template tokens** in prop values can be re-substituted by later passes
  (injection into user data). Deterministic but surprising. [MED]
- `beforeAll`/`afterAll` node ids emit `before()`/`after()` — intentional but a naming
  mismatch a reviewer will question. [LOW]

## 8. Anything else that concerns me
- **Config validation is shallow**: no cross-reference of `allowedChildren` to real
  types, no `PropDef.type` whitelist, no check that each command has a props entry. Config
  authoring mistakes fail silently rather than at boot. [MED]
- **Insecure-context degradation is silent** (both UUID crash and Copy no-op) — an
  operator deploying over plain HTTP gets no clear signal. [MED]
- The two O(n) traversals per change (`processFlow` + `findUnresolvedNodes`) duplicate a
  full walk of the tree on every keystroke; acceptable now, first thing to optimize if
  scale grows. [LOW]

**Recommendation:** the two [HIGH] compiler items (unescaped values, `should` optional
value) and the [HIGH] insecure-context UUID crash are the items I would want triaged
before calling this production-ready. Everything else is either intentional scope or
low-severity and can be documented as known limitations.
```
