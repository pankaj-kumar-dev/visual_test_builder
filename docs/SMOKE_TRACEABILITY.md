# Smoke Test → Cypress Spec Traceability

Maps every Smoke Test ID (from `SMOKE_TESTS.md`) to the artifact that automates it.
SM-01 and SM-02 are CLI gates (not Cypress); the rest are Cypress E2E, one spec per major
feature.

| Smoke ID | Feature | Automated by | Location |
|---|---|---|---|
| SM-01 | Production build | CLI script | `npm run build` |
| SM-02 | Type checking | CLI script | `npm run typecheck` |
| SM-03 | App launch / registry load | Cypress | `cypress/e2e/app.cy.ts` |
| SM-04 | Palette renders from registry | Cypress | `cypress/e2e/palette.cy.ts` |
| SM-05 | Create root node | Cypress | `cypress/e2e/canvas.cy.ts` |
| SM-06 | Nested flow / recursive render | Cypress | `cypress/e2e/canvas.cy.ts` |
| SM-07 | Node selection | Cypress | `cypress/e2e/canvas.cy.ts` |
| SM-08 | Edit property → output updates | Cypress | `cypress/e2e/property-editor.cy.ts` |
| SM-09 | Generated code correctness | Cypress | `cypress/e2e/output.cy.ts` |
| SM-10 | Copy generated code | Cypress | `cypress/e2e/output.cy.ts` |
| SM-11 | Delete node | Cypress | `cypress/e2e/canvas.cy.ts` |
| SM-12 | Reorder siblings | Cypress | `cypress/e2e/canvas.cy.ts` |
| SM-13 | Required indicator + warning | Cypress | `cypress/e2e/property-editor.cy.ts` |

Spec-per-feature summary:

- `app.cy.ts` — SM-03
- `palette.cy.ts` — SM-04
- `canvas.cy.ts` — SM-05, SM-06, SM-07, SM-11, SM-12
- `property-editor.cy.ts` — SM-08, SM-13
- `output.cy.ts` — SM-09, SM-10
