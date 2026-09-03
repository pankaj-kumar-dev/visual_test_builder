/**
 * Smoke — Phase 2 block/callback composition (within/then/each/session): palette,
 * drop validation into and around a block body, property editing (including the
 * callback "binding" field), collapse/expand, reordering, empty-block validation,
 * nested block editing, and generated output.
 *
 * Generator correctness (exact output at depth, invalid-JS safety) is covered by
 * src/engine/processFlow.test.ts and src/engine/goldenFlows.test.ts; this spec
 * only exercises what genuinely needs a real browser — UI interaction.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
  toggleCollapse,
} from '../support/flows';

function attemptRejectedDrop(parentLabel: string, type: string): void {
  cy.get('[data-testid=tree-node]')
    .its('length')
    .then((before) => {
      nodeIdByLabel(parentLabel).then((id) => {
        cy.dragDrop(`[data-testid=palette-item-${type}]`, `[data-node-id="${id}"]`);
      });
      cy.get('[data-testid=tree-node]').should('have.length', before);
    });
}

describe('Blocks (Phase 2)', () => {
  beforeEach(() => {
    cy.visit('/');
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Grid');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'validates a row');
  });

  it('1. adds a block node (Within) from the palette, visually marked as a block', () => {
    addChild('Test Case', 'within');
    cy.contains('[data-testid=tree-node]', 'Within')
      .should('have.attr', 'data-block', 'true')
      .find('[data-testid=tree-node-block-icon]')
      .should('exist');
  });

  it('2. adds a child inside the block body', () => {
    addChild('Test Case', 'within');
    addChild('Within', 'get');
    cy.get('[data-testid=tree-node]').should('have.length', 4); // describe, it, within, get
    cy.contains('[data-testid=tree-node]', 'Get').should('exist');
  });

  it('3. edits a child property inside the block', () => {
    addChild('Test Case', 'within');
    addChild('Within', 'get');
    selectNode('Get');
    setProp('selector', '.row-name');
    openCodeDrawer();
    cy.get('[data-testid=output-code]').should('contain.text', "cy.get('.row-name');");
  });

  it('4. collapses and re-expands the block, hiding/restoring its body', () => {
    addChild('Test Case', 'within');
    addChild('Within', 'get');
    toggleCollapse('Within');
    cy.contains('[data-testid=tree-node]', 'Within').should('have.attr', 'data-collapsed', 'true');
    cy.contains('[data-testid=tree-node]', 'Get').should('not.exist');

    toggleCollapse('Within');
    cy.contains('[data-testid=tree-node]', 'Within').should('have.attr', 'data-collapsed', 'false');
    cy.contains('[data-testid=tree-node]', 'Get').should('exist');
  });

  it('5. reorders children within the block body and the output reflects the new order', () => {
    addChild('Test Case', 'within');
    addChild('Within', 'visit');
    selectNode('Visit');
    setProp('url', '/first');
    addChild('Within', 'log');
    selectNode('Log');
    setProp('message', 'second');
    // within's children are now [visit, log]; reorder to [log, visit].

    nodeIdByLabel('Within').then((withinId) => {
      nodeIdByLabel('Visit').then((visitId) => {
        cy.dragDrop(
          `[data-node-id="${visitId}"]`,
          `[data-parent-id="${withinId}"][data-before-index="2"]`,
        );
      });
    });

    openCodeDrawer();
    cy.get('[data-testid=output-code]').should(($el) => {
      const text = $el.text();
      expect(text.indexOf("cy.log('second');")).to.be.lessThan(text.indexOf("cy.visit('/first');"));
    });
  });

  it('6. generates correct, complete code for a block with a chain child', () => {
    addChild('Test Case', 'within');
    selectNode('Within');
    setProp('selector', '.row');
    addChild('Within', 'chain');
    addChild('Chain', 'get');
    selectNode('Get');
    setProp('selector', '.name');
    addChild('Chain', 'should');
    selectNode('Assert');
    cy.get('[data-testid=prop-assertion]').select('be.visible');

    openCodeDrawer();
    const expected = `describe('Grid', () => {
  it('validates a row', () => {
    cy.get('.row').within(() => {
      cy.get('.name').should('be.visible');
    });
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('7. rejects an invalid placement — a structural node cannot be dropped inside a block body', () => {
    addChild('Test Case', 'within');
    attemptRejectedDrop('Within', 'describe');
    cy.contains('[data-testid=tree-node]', 'Describe Block').should('have.length', 1); // only the root
  });

  it('8. flags an empty block as unresolved — canvas highlight and drawer warning', () => {
    addChild('Test Case', 'each');
    selectNode('Each');
    setProp('selector', '.rows');

    cy.contains('[data-testid=tree-node]', 'Each').should('have.attr', 'data-unresolved', 'true');

    openCodeDrawer();
    cy.get('[data-testid=unresolved-warning]').should('contain.text', 'Block body is empty');
  });

  it('9. edits a property inside a nested block (within > each)', () => {
    addChild('Test Case', 'within');
    selectNode('Within');
    setProp('selector', '.grid');
    addChild('Within', 'each');
    selectNode('Each');
    setProp('selector', '.row');

    openCodeDrawer();
    cy.get('[data-testid=output-code]').should(($el) => {
      const text = $el.text();
      expect(text).to.contain("cy.get('.grid').within(() => {");
      expect(text).to.contain("cy.get('.row').each(($el, index) => {");
    });
  });

  it('10. the callback binding field (then\'s "as") is editable and appears in the generated signature', () => {
    addChild('Test Case', 'then');
    selectNode('Then');
    setProp('selector', '.user');

    // No binding yet — callback takes no parameter.
    cy.get('[data-testid=tree-node]')
      .contains('Then')
      .closest('[data-testid=tree-node]')
      .find('[data-testid=tree-node-params]')
      .should('not.exist');

    cy.get('[data-testid=prop-as]').type('user');

    cy.get('[data-testid=tree-node]')
      .contains('Then')
      .closest('[data-testid=tree-node]')
      .find('[data-testid=tree-node-params]')
      .should('have.text', '(user)');

    addChild('Then', 'log');
    selectNode('Log');
    setProp('message', 'x');

    openCodeDrawer();
    cy.get('[data-testid=output-code]').should('contain.text', 'then((user) => {');
  });
});
