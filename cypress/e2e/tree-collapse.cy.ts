/**
 * Smoke — Collapsible flow tree (Scalable Builder UI, Objective 3).
 *
 * Collapse is UI state: it must hide rows without touching the Flow JSON, the node
 * order, or the generated code, and every other canvas interaction (select, delete,
 * reorder, drop) must keep working around it.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  searchPalette,
  selectNode,
  setProp,
  toggleCollapse,
} from '../support/flows';

/** describe > it("A") > chain(get, click), plus a second empty it("B"). */
function buildTwoCaseFlow(): void {
  addRoot('describe');
  selectNode('Describe Block');
  setProp('label', 'Suite');

  addChild('Describe Block', 'it');
  selectNode('Test Case');
  setProp('label', 'A');

  addChild('Test Case', 'chain');
  addChild('Chain', 'get');
  selectNode('Get');
  setProp('selector', '.row');
  addChild('Chain', 'click');
}

describe('Tree collapse', () => {
  beforeEach(() => {
    cy.visit('/');
    buildTwoCaseFlow();
  });

  context('collapse and expand', () => {
    it('hides descendants and reports state on the control', () => {
      cy.get('[data-testid=tree-node]').should('have.length', 5);

      cy.contains('[data-testid=tree-node]', 'Test Case')
        .find('[data-testid=node-toggle]')
        .should('have.attr', 'aria-expanded', 'true');

      toggleCollapse('Test Case');

      cy.get('[data-testid=tree-node]').should('have.length', 2);
      cy.contains('[data-testid=tree-node]', 'Chain').should('not.exist');
      cy.contains('[data-testid=tree-node]', 'Test Case')
        .find('[data-testid=node-toggle]')
        .should('have.attr', 'aria-expanded', 'false');
    });

    it('restores the same subtree on expand', () => {
      toggleCollapse('Test Case');
      toggleCollapse('Test Case');

      cy.get('[data-testid=tree-node]').should('have.length', 5);
      cy.contains('[data-testid=tree-node]', 'Get').should('exist');
      cy.contains('[data-testid=tree-node]', 'Click').should('exist');
    });

    it('shows how many children are hidden', () => {
      toggleCollapse('Chain');
      cy.contains('[data-testid=tree-node]', 'Chain')
        .find('[data-testid=node-child-count]')
        .should('have.text', '2');
    });

    it('gives leaf commands no collapse control', () => {
      cy.contains('[data-testid=tree-node]', 'Click')
        .find('[data-testid=node-toggle]')
        .should('not.exist');
    });

    it('collapses nested levels independently', () => {
      toggleCollapse('Chain');
      cy.get('[data-testid=tree-node]').should('have.length', 3);

      toggleCollapse('Test Case');
      cy.get('[data-testid=tree-node]').should('have.length', 2);

      // Expanding the outer level leaves the inner one collapsed.
      toggleCollapse('Test Case');
      cy.get('[data-testid=tree-node]').should('have.length', 3);
      cy.contains('[data-testid=tree-node]', 'Get').should('not.exist');
    });

    it('exposes the toggle as a keyboard-operable button with an accessible name', () => {
      // Cypress's synthetic `{enter}` cannot reproduce a browser's native button
      // activation, so what is asserted is the thing that guarantees it: a real
      // <button>, focusable, named, and reporting its expanded state.
      cy.contains('[data-testid=tree-node]', 'Chain')
        .find('[data-testid=node-toggle]')
        .should('match', 'button')
        .and('have.attr', 'aria-label', 'Collapse Chain')
        .and('have.attr', 'aria-expanded', 'true')
        .focus();
      cy.focused().should('have.attr', 'data-testid', 'node-toggle');

      cy.focused().click();
      cy.contains('[data-testid=tree-node]', 'Chain')
        .find('[data-testid=node-toggle]')
        .should('have.attr', 'aria-label', 'Expand Chain');
    });
  });

  context('collapse never changes the test definition', () => {
    it('leaves the generated code byte-identical', () => {
      openCodeDrawer();
      cy.get('[data-testid=output-code]')
        .invoke('text')
        .then((before) => {
          toggleCollapse('Test Case');
          cy.get('[data-testid=output-code]').should('have.text', before);

          toggleCollapse('Test Case');
          cy.get('[data-testid=output-code]').should('have.text', before);
        });
    });

    it('keeps a collapsed node selectable and editable', () => {
      toggleCollapse('Test Case');
      selectNode('Test Case');

      cy.contains('[data-testid=tree-node]', 'Test Case').should('have.class', 'is-selected');
      cy.get('[data-testid=prop-label]').should('have.value', 'A');

      setProp('label', 'Renamed');
      openCodeDrawer();
      cy.get('[data-testid=output-code]').should('contain.text', "it('Renamed', () => {");
    });

    it('deletes a collapsed subtree in full', () => {
      toggleCollapse('Test Case');
      openCodeDrawer();

      cy.contains('[data-testid=tree-node]', 'Test Case')
        .find('[data-testid=node-delete]')
        .click();

      cy.get('[data-testid=tree-node]').should('have.length', 1);
      cy.get('[data-testid=output-code]').should('not.contain.text', 'cy.get');
      cy.get('[data-testid=output-code]').should('contain.text', "describe('Suite'");
    });

    it('expands a collapsed parent when a node is dropped into it', () => {
      toggleCollapse('Chain');
      cy.contains('[data-testid=tree-node]', 'Get').should('not.exist');

      nodeIdByLabel('Chain').then((id) => {
        cy.dragDrop('[data-testid=palette-item-should]', `[data-node-id="${id}"]`);
      });

      cy.contains('[data-testid=tree-node]', 'Get').should('exist');
      cy.contains('[data-testid=tree-node]', 'Assert').should('exist');
    });
  });

  context('reordering around collapsed nodes', () => {
    beforeEach(() => {
      addChild('Describe Block', 'it'); // a second, empty Test Case at index 1
    });

    it('keeps collapse attached to the node, not to its position', () => {
      // Collapse the first (populated) test case, then move it below the second.
      toggleCollapse('Test Case');
      cy.get('[data-testid=tree-node]').should('have.length', 3);

      nodeIdByLabel('Describe Block').then((describeId) => {
        cy.contains('[data-testid=tree-node]', 'Test Case')
          .invoke('attr', 'data-node-id')
          .then((firstId) => {
            cy.dragDrop(
              `[data-node-id="${firstId}"]`,
              `[data-parent-id="${describeId}"][data-before-index="2"]`,
            );
            // Still collapsed, still the same node — the flag travelled with it.
            cy.get(`[data-node-id="${firstId}"]`)
              .should('have.attr', 'data-collapsed', 'true')
              .and('contain.text', 'A');
          });
      });

      // The sibling that moved up did not inherit a collapsed state.
      cy.get('[data-testid=tree-node]').should('have.length', 3);
    });
  });
});

/**
 * The §38 reference flow, built through the real UI:
 *
 *   Describe: User Management
 *    ├── Before Each > Chain(get, click)
 *    ├── It: Create  > Chain(get, click)
 *    ├── It: Search  > Chain(get, click)   ← its `get` is left unresolved on purpose
 *    ├── It: Edit    > Chain(get, click)
 *    └── It: Delete  > Chain(get, click)
 *
 * 21 rows fully expanded. Each branch is collapsed as soon as it is built, which is
 * both how the feature is meant to be used at this size and what keeps the next
 * `Chain` row unambiguous for the label-based helpers.
 */
describe('Tree collapse — a realistic larger flow (§38)', () => {
  const CASES = ['Create', 'Search', 'Edit', 'Delete'];
  const UNRESOLVED_CASE = 'Search';

  function addChain(parentLabel: string, selector: string | null): void {
    addChild(parentLabel, 'chain');
    addChild('Chain', 'get');
    if (selector) {
      selectNode('Get');
      setProp('selector', selector);
    }
    addChild('Chain', 'click');
  }

  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'User Management');

    addChild('Describe Block', 'beforeEach');
    addChain('Before Each', '#app');
    toggleCollapse('Before Each');

    CASES.forEach((name) => {
      addChild('Describe Block', 'it');
      // The newly added `it` is appended last and has no children yet, so it is the
      // last row; every earlier one already carries its own name.
      cy.get('[data-testid=tree-node]').last().click();
      setProp('label', name);

      addChain(name, name === UNRESOLVED_CASE ? null : `.${name.toLowerCase()}`);
      toggleCollapse(name);
    });
  });

  it('builds the full suite and collapses it down to an outline', () => {
    // Expanded: 1 describe + 5 branches × 4 rows = 21.
    cy.contains('[data-testid=tree-node]', 'Before Each')
      .find('[data-testid=node-toggle]')
      .click();
    CASES.forEach((name) => toggleCollapse(name));
    cy.get('[data-testid=tree-node]').should('have.length', 21);

    // Back to the outline, then to a single row.
    toggleCollapse('Before Each');
    CASES.forEach((name) => toggleCollapse(name));
    cy.get('[data-testid=tree-node]').should('have.length', 6);

    toggleCollapse('User Management');
    cy.get('[data-testid=tree-node]').should('have.length', 1);
    cy.contains('[data-testid=tree-node]', 'Describe Block')
      .find('[data-testid=node-child-count]')
      .should('have.text', '5');

    toggleCollapse('User Management');
    cy.get('[data-testid=tree-node]').should('have.length', 6);
  });

  it('generates the whole suite regardless of what is collapsed', () => {
    openCodeDrawer();
    cy.get('[data-testid=output-code]').should(($el) => {
      const code = $el.text();
      expect(code).to.contain("describe('User Management', () => {");
      expect(code).to.contain('beforeEach(() => {');
      CASES.forEach((name) => expect(code).to.contain(`it('${name}', () => {`));
      expect(code).to.contain("cy.get('#app').click();");
      expect(code).to.contain("cy.get('.create').click();");
    });
  });

  it('search stays usable while a large flow is on the canvas', () => {
    searchPalette('assert');
    cy.get('[data-testid=palette-item-should]').should('be.visible');
    cy.get('[data-testid=tree-node]').should('have.length', 6);
  });

  it('reveals a hidden unresolved node from the code drawer (§31)', () => {
    // The `get` under "Search" has no selector and sits behind two collapsed
    // ancestors: its own `it`, and the describe.
    toggleCollapse('User Management');
    openCodeDrawer();
    cy.get('[data-testid=tree-node]').should('have.length', 1);

    cy.get('[data-testid=unresolved-warning]').contains('button', 'Get').click();

    // Ancestors expanded, node selected and visible, the missing field highlighted —
    // and the drawer state is preserved.
    cy.contains('[data-testid=tree-node]', 'Get')
      .should('be.visible')
      .and('have.class', 'is-selected');
    cy.get('[data-testid=prop-selector]').should('have.class', 'is-missing');
    cy.get('[data-testid=code-drawer]').should('exist');

    // Only the ancestors were expanded — the unrelated branches stay collapsed.
    cy.contains('[data-testid=tree-node]', 'Create')
      .should('have.attr', 'data-collapsed', 'true');
  });
});
