# Visual Test Builder

### Build Cypress E2E tests in minutes, not hours. Click it together, validate it live, ship clean code.

Writing end-to-end tests by hand is slow, repetitive, and easy to get wrong. **Visual Test Builder** turns it into a fast, guided workflow: assemble your test as a visual flow, fill in what each step needs, get instant feedback on anything missing, and walk away with a ready-to-use Cypress spec.

No boilerplate. No forgotten selectors. No guessing what the chain should look like. You stay in control of every line that comes out.

**Try it now:** [Open Visual Test Builder](https://visual-test-builder-one.vercel.app/) — no sign-up, no install.
**Source code:** [GitHub repository](https://github.com/pankaj-kumar-dev/visual_test_builder)

![Visual Test Builder workspace showing the palette, the flow canvas, and the property editor](docs/images/01-builder-overview.png)

> **Know what you're getting:** Visual Test Builder is a test *builder* — it creates the Cypress code, you run it in your own Cypress setup against your own app. That's what keeps the output yours. See [Generating code vs. running it](#generating-code-vs-running-it).

---

## Contents

- [Why it's fast](#why-its-fast)
- [Quick start (3 steps, no install)](#quick-start-3-steps-no-install)
- [Tutorial: build your first Cypress test](#tutorial-build-your-first-cypress-test)
- [Worked examples](#worked-examples)
- [Advanced usage](#advanced-usage)
- [Generating code vs. running it](#generating-code-vs-running-it)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Run it locally](#run-it-locally)
- [License](#license)

---

## Why it's fast

- **Start in one click.** Load a ready-made template — Login, CRUD, Form Validation, Search or API — or begin with a blank test case.
- **Everything is a block.** Drag from a searchable palette of **56 Cypress commands**, plus suites, hooks, chains, control flow and reusable workflows.
- **Properties that know their context.** The editor shows only the fields that make sense for the step you selected, and marks required ones.
- **Real Cypress chains.** Compose `cy.get(...).find(...).first().click()` visually; invalid arrangements are rejected before they become broken code.
- **Reusable flows.** Drop in Login, Logout, Search or Create/Read/Update/Delete Record as custom commands — or save your own from any step.
- **Live validation.** A badge counts what's missing; click an issue and land right on the offending step.
- **Fearless editing.** Undo/redo, multi-select, duplicate, reorder, collapse — and your work auto-saves in the browser.
- **Output you can ship.** Copy the code, or hit **Build Test** to download a syntax-checked `*.cy.ts` spec — plus `commands.ts` and a dependency list when you use reusable flows or fixtures.
- **Portable.** Export your flow as `flow.json`, import it anywhere.

Everything runs in the browser. No account. No setup.

---

## Quick start (3 steps, no install)

1. **Open the app** → [visual-test-builder-one.vercel.app](https://visual-test-builder-one.vercel.app/) and click **Open Builder**.
2. **Pick a template.** On the empty canvas choose **Login Test** (or **Start from a blank test case**).
3. **Get your code.** Click **`</> Code`** for the live generated Cypress code, or **▶ Build Test** to validate it and download the files.

![Landing page with the Open Builder button](docs/images/02-landing-page.png)

![Template picker on an empty canvas](docs/images/03-template-picker.png)

---

## Tutorial: build your first Cypress test

We'll build a **login test** from start to finish, then run it in a real Cypress project.

> The selectors used here (`#username`, `#password`, `#login-submit`, `#dashboard`) are **illustrative**. Swap in selectors from *your* app — see [Choose stable selectors](#choose-stable-selectors).

### Step 1 — Open the app

Go to [visual-test-builder-one.vercel.app](https://visual-test-builder-one.vercel.app/) and click **Open Builder**. No account, no setup. Your flow auto-saves in your browser's `localStorage` (one flow per browser).

### Step 2 — Start from a template

The empty canvas offers a **Templates** panel:

| Template | What it builds |
| --- | --- |
| **Login Test** | Visit the login page, sign in, assert the dashboard appears |
| **CRUD Test** | Create a record, delete it, assert a notification each time |
| **Form Validation Test** | Submit with required fields empty, assert the validation error |
| **Search Test** | Type a query, submit, assert the results list |
| **API Test** | Intercept a request, trigger it, wait on the alias, assert |
| **Start from a blank test case** | An empty `describe` > `it`, ready to build on |

Click **Login Test**. Want a fresh start later? Hit **New** in the header.

### Step 3 — Learn the workspace

![Workspace with numbered callouts for palette, canvas, property editor and header](docs/images/04-workspace-labelled.png)

1. **Palette** (left) — every block and command, grouped by category. Search to jump straight to one (try `click`).
2. **Canvas** (center) — your test as a tree: a **Suite** (`describe`) holds **Test cases** (`it`), which hold **command steps**.
3. **Property editor** (right) — the fields for whatever step is selected.
4. **Header** — Undo/Redo, New/Export/Import, and the **Validate**, **Code** and **Build Test** panels.

Add a step by dragging a chip onto the canvas, **or** use the **+** (“Add step here”) control between steps and search for the command. Reorder by dragging, or use the node's `⋮` menu (Move up / Move down / Duplicate / Delete).

### Step 4 — Configure each command

Select a step and fill in its fields. A `*` marks a required field.

| Kind of value | Used by | Example |
| --- | --- | --- |
| **URL** | `visit` | `/login` |
| **Selector** | `get`, `click`, `type`, `should` … | `#username` |
| **Input value** | `type`, `select` | `testuser` |
| **Assertion** | `should` (dropdown: `be.visible`, `have.text`, `have.value` …) | `be.visible` |

The Login template looks like this:

```
describe  "Login"
└── it    "logs in with valid credentials"
    ├── visit   url=/login
    ├── type    selector=#username   value=testuser
    ├── type    selector=#password   value=password123
    ├── click   selector=#login-submit
    └── should  selector=#dashboard  assertion=be.visible
```

![Property editor showing the selector and value fields for a type step](docs/images/05-property-editor.png)

### Step 5 — Chain commands like a pro

Commands placed **directly** under a test case are independent statements — each one finds its own element:

```js
cy.get('#login-submit').click();
```

For a true Cypress **subject chain**, drop a **Chain** block (Structural → Composition) into the test case and build inside it:

```
chain
├── get    selector=.items
├── find   selector=.item
├── first
└── click
```

Generates:

```js
cy.get('.items')
  .find('.item')
  .first()
  .click();
```

The builder keeps your chains valid:

- The **first** command must be a *root* command (`get`, `contains`, `intercept`, `fixture`, …) — it creates the subject.
- Every command **after** it must be a *subject* command (`find`, `first`, `click`, `type`, `should` …).
- Inside a chain, **Selector** is hidden on subject commands — the subject already comes from the previous step.
- Invalid drops (like `visit` inside a chain) are rejected as you drag.

![A chain block on the canvas next to the generated chained Cypress code](docs/images/06-chain-block.png)

### Step 6 — Catch problems before they ship

Click **✓ Validate** in the header. A badge shows how many errors need attention.

- Missing required fields light up in orange — on the canvas node *and* in the property editor.
- The Validate panel lists **errors** and **warnings**. **Click any entry** to select that step, expand collapsed parents, and scroll it into view.
- Fix the field and the node highlight, field highlight, and panel entry all clear together.

![Validation panel listing an issue with the matching node highlighted on the canvas](docs/images/07-validation-panel.png)

### Step 7 — Get your code

Two panels, one open at a time:

| Panel | Button | What it gives you |
| --- | --- | --- |
| **Code** drawer | `</> Code` | Live view of the generated code, one-click copy, and unresolved-property warnings. |
| **Build Test** panel | `▶ Build Test` | Validates, generates a named spec (e.g. `login.cy.ts`), **syntax-checks** it, lists **dependencies** (custom commands, fixtures) and offers **Download** for each file. |

The Login template produces:

```js
describe('Login', () => {
  it('logs in with valid credentials', () => {
    cy.visit('/login');
    cy.get('#username').type('testuser');
    cy.get('#password').type('password123');
    cy.get('#login-submit').click();
    cy.get('#dashboard').should('be.visible');
  });
});
```

Download it as `login.cy.ts`.

> **"Compile-ready (syntax)" means the file parses as TypeScript — it does not guarantee the test passes.** Only your app can tell you that. Next step.

### Step 8 — Run it in your Cypress project

1. **Have a Cypress project** (Cypress 12+). Don't? `npm install --save-dev cypress`, then `npx cypress open` once to scaffold.
2. **Copy the spec** to `cypress/e2e/login.cy.ts`.
3. **If Build Test listed dependencies:**
   - *Custom command* → copy the downloaded `commands.ts` content into `cypress/support/commands.ts` (and make sure `cypress/support/e2e.ts` imports it).
   - *Fixture* → create the file shown, e.g. `cypress/fixtures/sample.json`.
4. **Set `baseUrl`** in `cypress.config.ts` so `cy.visit('/login')` reaches your app:
   ```ts
   import { defineConfig } from 'cypress';
   export default defineConfig({ e2e: { baseUrl: 'http://localhost:3000' } });
   ```
5. **Match the selectors** to your real DOM (`#username`, `#login-submit` … are placeholders).
6. **Run:** `npx cypress open` (interactive) or `npx cypress run --spec cypress/e2e/login.cy.ts` (headless).

---

## Worked examples

Every output below was produced by the current generator (`buildSpec`) from the flow shown.

### Example 1 — Basic UI test: visit, find, assert visible

```
describe "Home page"
└── it "opens the application"
    ├── visit  url=/
    └── chain
        ├── get     selector=[data-testid="welcome"]
        └── should  assertion=be.visible
```

`home-page.cy.ts`:

```js
describe('Home page', () => {
  it('opens the application', () => {
    cy.visit('/');
    cy.get('[data-testid="welcome"]').should('be.visible');
  });
});
```

### Example 2 — Form interaction: type, click, assert

Load the **Login Test** or **Form Validation Test** template, or build:

```
describe "Login" → it "logs in with valid credentials"
├── visit  /login
├── type   #username = testuser
├── type   #password = password123
├── click  #login-submit
└── should #dashboard be.visible
```

Output `login.cy.ts`: see [Step 7](#step-7--get-your-code).

### Example 3 — Advanced: chains, intercept, reusable flows, fixtures

```
describe "Account"
└── it "logs in, saves, then logs out"
    ├── flowInvocation  flow=login  username=testuser  password=password123
    ├── chain
    │   ├── intercept  method=POST  url=/api/save
    │   └── as         name=saveRequest
    ├── chain
    │   ├── get    selector=[data-testid="save"]
    │   └── click
    ├── waitAlias  alias=@saveRequest
    ├── fixture    path=sample.json
    └── flowInvocation  flow=logout
```

`account.cy.ts`:

```js
describe('Account', () => {
  it('logs in, saves, then logs out', () => {
    cy.login('testuser', 'password123');
    cy.intercept('POST', '/api/save').as('saveRequest');
    cy.get('[data-testid="save"]').click();
    cy.wait('@saveRequest');
    cy.fixture('sample.json');
    cy.logout();
  });
});
```

**Build Test** reports exactly what this spec needs:

| Kind | Item | What you do |
| --- | --- | --- |
| Custom command | `cy.login()` | Add to `cypress/support/commands.ts` |
| Custom command | `cy.logout()` | Add to `cypress/support/commands.ts` |
| Fixture | `cypress/fixtures/sample.json` | Create the file |

And generates the `commands.ts` for you (the downloaded file also includes the matching TypeScript `declare global` types):

```js
Cypress.Commands.add('login', (username, password) => {
  cy.visit('/login');
  cy.get('#username').type(username);
  cy.get('#password').type(password);
  cy.get('#login-submit').click();
});

Cypress.Commands.add('logout', () => {
  cy.get('#logout-button').click();
  cy.get('#login-form').should('be.visible');
});
```

### Choose stable selectors

Tests last longer when they target attributes made for testing, not styling:

| Selector | Stability |
| --- | --- |
| `[data-testid="login-submit"]` / `[data-cy="login-submit"]` | **Stable** — exists only for tests; survives restyling |
| `#login-submit` | Usually fine if ids are stable |
| `.btn.btn-primary.mt-3` | **Brittle** — breaks when CSS or layout changes |
| `div > div:nth-child(3) button` | **Brittle** — breaks when markup shifts |

The generated test still relies on your application's real DOM, behavior and test environment (data, login state, network) — so a good selector strategy is what turns generated code into a reliable test.

---

## Advanced usage

| Feature | How |
| --- | --- |
| **Command chaining** | Drop a **Chain** block; one root command, then subject commands. See [Step 5](#step-5--chain-commands-like-a-pro). |
| **Assertions** | `should` (and `and` to stack more). Pick from the dropdown: `be.visible`, `have.text`, `have.length`, … |
| **Hooks** | `beforeAll`, `beforeEach`, `afterEach`, `afterAll` inside a `describe`. |
| **Scoping / iteration** | `within`, `then`, `each`, `session` blocks. |
| **Control flow** | `if` (Then/Else), `forEach`, `switch` / `case` / `default`, `try` (with Catch). Conditions are raw JavaScript expressions. |
| **Network** | `intercept` (optionally stub a response) → `as` → `waitAlias`; `request` for direct HTTP calls. |
| **Reusable flows** | Add a **Flow invocation** and pick Login, Logout, Search, Create/Read/Update/Delete Record, Grid Row Action or Notification Validation. They export as `Cypress.Commands.add(...)`. Save your own: step `⋮` menu → **Save as reusable flow**. |
| **Multi-select** | Shift+click selects a range; Ctrl/Cmd+click toggles one. Then Delete or Duplicate everything selected. |
| **Collapse** | ▸/▾ on any node with children; warnings automatically re-expand their ancestors. |
| **Templates** | **New** → choose one of the 5 templates. |
| **Validation** | `✓ Validate` panel; errors and warnings are counted separately, and Build Test shows both. |
| **Download files** | `▶ Build Test` → **Download** beside the spec and (if present) `commands.ts`. |
| **Save / share a flow** | **Export** downloads `flow.json`; **Import** loads one (invalid files are rejected, canvas untouched). |

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + D` | Duplicate selected step(s) |
| `Delete` | Delete selected step(s) |
| `Esc` | Close the Code drawer or Validate panel |

Shortcuts pause while you're typing in a text field.

Every available command lives in the palette (left panel) — search by name, and look for `*` in the property editor to see what's required.

---

## Generating code vs. running it

| | Visual Test Builder | Your Cypress project |
| --- | --- | --- |
| Builds the flow | ✅ | |
| Validates required fields | ✅ | |
| Generates Cypress code | ✅ | |
| Syntax-checks the output ("Compile-ready") | ✅ | |
| Knows your app's DOM, URLs, data, auth | ❌ | ✅ |
| Executes the test in a browser | ❌ | ✅ |
| Tells you if the test **passes** | ❌ | ✅ |

“Compile-ready (syntax)” proves the file is valid TypeScript. It doesn't resolve Cypress types, reach your app, or confirm any selector exists — your Cypress run does that.

In this repository, `npm run verify:export` goes further for a *representative* export: it type-checks against real Cypress types and runs it in a real browser against a bundled fixture page. That's a repo-level check, not a feature of the web app, and it says nothing about *your* application.

---

## Troubleshooting

| Problem | What to do |
| --- | --- |
| **Build Test is disabled / “Add a step to the canvas”** | The canvas is empty. Click **New** and pick a template or blank test case. |
| **Orange highlight / `{{selector}}` in the code** | A required property is empty. Open **Validate**, click the entry, fill the field. |
| **A property is missing from the editor** | Inside a chain, subject commands hide **Selector** (it comes from the previous step). That's by design. |
| **A drop is rejected** | The target doesn't allow that child (e.g. `visit` in a chain, a second root in a chain, a command directly under `describe`). Drop it into a test case or a valid chain position. |
| **`// [Invalid chain] — …` in the code** | The chain has no root, two roots, or an unsupported command — often after reordering. Fix the order. |
| **“Syntax errors” in Build Test** | Usually a raw-JS field (`expression`, `condition`, `stubResponse`) holds invalid JavaScript. Click the entry to jump to the node. |
| **`cy.login is not a function` when running** | A reusable flow is used but `commands.ts` isn't installed. Copy the downloaded file into `cypress/support/` and import it from `support/e2e.ts`. |
| **`cy.fixture` fails** | The fixture listed under Dependencies doesn't exist in `cypress/fixtures/`. |
| **Test fails: element not found / timed out** | The selector doesn't match your DOM. Use `data-testid`/`data-cy` and check it in Cypress's selector playground. |
| **`cy.visit('/…')` fails** | Set `baseUrl` in `cypress.config.ts` or use a full URL. |
| **Import says the file is invalid** | Not a valid `flow.json` (unknown node type, missing `id`/`type`, bad `children`). Your canvas was left untouched. |
| **My flow disappeared** | Flows live in this browser's `localStorage`. Private windows, cleared site data or another browser/device won't have it — use **Export** to keep a copy. |

---

## Limitations

- **A builder, not a runner.** It never executes tests or opens a browser — that's your Cypress project's job.
- **One flow per browser.** Multi-flow management and schema-versioned `flow.json` aren't available yet.
- **Plain code view.** No syntax highlighting or in-app editing of the generated code.
- **Targets Cypress 12+.** Output is TypeScript (`*.cy.ts`).
- **Raw JavaScript fields are checked for syntax only.** Conditions and expressions are emitted as written.
- **Reordering isn't chain-checked.** An invalid chain created by reordering is flagged in the generated code rather than blocked while dragging.
- **Desktop-first.** Built for desktop and tablet widths, not a full mobile experience.
- **A curated command set.** Cypress is huge; browse the palette to see what's covered.

---

## Run it locally

Only needed to develop or self-host. Requires Node.js 18+.

```bash
git clone https://github.com/pankaj-kumar-dev/visual_test_builder.git
cd visual_test_builder
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest unit tests |
| `npm run cy:run` | Cypress E2E suite for the app itself (needs `npm run dev` running) |
| `npm run verify:export` | Generate, type-check and run a representative exported spec (needs `npm run dev` running) |

CI (`.github/workflows/ci.yml`) runs build, typecheck, unit tests, export verification and the Cypress suite on every push and pull request.

---

## License

MIT
