/**
 * Smoke — Property editor: edit updates output; required indicator + warning
 * (SM-08, SM-13), plus Phase 2 UI unresolved-state highlighting (canvas node +
 * property field, both sourced from the same findUnresolvedNodes result as the
 * code drawer's warning list).
 */

import { addChild, addRoot, openCodeDrawer, selectNode, setProp } from '../support/flows';

describe('Property editor', () => {
  beforeEach(() => {
    cy.visitApp();
    addRoot('describe');
    addChild('Describe Block', 'it');
    openCodeDrawer();
  });

  context('SM-08 — editing a property updates the output', () => {
    it('compiles the type node from its property values', () => {
      addChild('Test Case', 'type');
      selectNode('Type');
      cy.get('[data-testid=prop-selector]').type('#username');
      cy.get('[data-testid=prop-value]').type('admin');

      cy.get('[data-testid=output-code]').should(
        'contain.text',
        "cy.get('#username').type('admin');",
      );
    });
  });

  context('SM-13 — required indicator and unresolved warning', () => {
    beforeEach(() => {
      addChild('Test Case', 'click');
      selectNode('Click');
    });

    it('marks the empty required field and lists the node, retaining the placeholder', () => {
      cy.get('[data-testid=prop-selector]').should('have.class', 'is-missing');
      cy.get('[data-testid=unresolved-warning]')
        .should('exist')
        .and('contain.text', 'Click');
      cy.get('[data-testid=output-code]').should('contain.text', '{{selector}}');
    });

    it('removes this node from the warning once its required field is filled', () => {
      // describe/it still have empty labels, so the warning persists overall; this
      // node (Click) must drop out of it and its selector placeholder must resolve.
      cy.get('[data-testid=prop-selector]').type('#login');
      cy.get('[data-testid=unresolved-warning]').should('not.contain.text', 'Click');
      cy.get('[data-testid=output-code]').should('not.contain.text', '{{selector}}');
    });
  });

  context('Phase 2 UI — unresolved-state highlighting (canvas + property field)', () => {
    beforeEach(() => {
      addChild('Test Case', 'click');
      selectNode('Click');
    });

    it('highlights the unresolved node on the canvas', () => {
      cy.contains('[data-testid=tree-node]', 'Click')
        .should('have.class', 'tree-node__row--unresolved')
        .and('have.attr', 'data-unresolved', 'true');
      cy.get('[data-testid=tree-node-missing]').should('contain.text', 'Selector');
    });

    it('does not highlight a resolved sibling node', () => {
      // "Test Case" has its own unresolved label, but "Describe Block" here is the
      // one under test for the negative case — give it a label so it resolves.
      selectNode('Describe Block');
      cy.get('[data-testid=prop-label]').type('Suite');

      cy.contains('[data-testid=tree-node]', 'Describe Block').should(
        'not.have.class',
        'tree-node__row--unresolved',
      );
    });

    it('clears the canvas highlight once the field is fixed', () => {
      cy.contains('[data-testid=tree-node]', 'Click').should(
        'have.class',
        'tree-node__row--unresolved',
      );

      cy.get('[data-testid=prop-selector]').type('#login');

      cy.contains('[data-testid=tree-node]', 'Click').should(
        'not.have.class',
        'tree-node__row--unresolved',
      );
    });

    it('resolved property fields are not highlighted', () => {
      cy.get('[data-testid=prop-selector]').should('have.class', 'is-missing');
      cy.get('[data-testid=prop-selector]').type('#login');
      cy.get('[data-testid=prop-selector]').should('not.have.class', 'is-missing');
    });
  });
});

/**
 * Context-aware properties (Scalable Builder UI, Objective 4).
 *
 * The same command type, in two contexts, showing different fields — driven by
 * `visibleWhen` metadata, not by the command's name.
 */
describe('Property editor — node context', () => {
  beforeEach(() => {
    cy.visitApp();
    addRoot('describe');
    addChild('Describe Block', 'it');
  });

  context('standalone command (no subject)', () => {
    it('Click asks for its own selector', () => {
      addChild('Test Case', 'click');
      selectNode('Click');

      cy.get('[data-testid=prop-selector]').should('exist');
      cy.get('[data-testid=property-hidden-note]').should('not.exist');
      cy.get('[data-testid=property-context]').should('contain.text', 'in Test Case');
    });
  });

  context('inside a chain', () => {
    beforeEach(() => {
      addChild('Test Case', 'chain');
    });

    it('the root query still asks for the selector — it creates the subject', () => {
      addChild('Chain', 'get');
      selectNode('Get');

      cy.get('[data-testid=prop-selector]').should('exist');
      cy.get('[data-testid=property-context]').should('contain.text', 'in Chain');
      cy.get('[data-testid=property-hidden-note]').should('not.exist');
    });

    it('a subject query drops the selector and keeps only what it needs', () => {
      addChild('Chain', 'get');
      selectNode('Get');
      setProp('selector', '.items');

      addChild('Chain', 'find');
      selectNode('Find');

      cy.get('[data-testid=prop-target]').should('exist');
      cy.get('[data-testid=prop-selector]').should('not.exist');
      cy.get('[data-testid=property-hidden-note]')
        .should('contain.text', 'Container Selector')
        .and('contain.text', 'the subject comes from the previous command');
    });

    it('an index query shows the index, not another selector', () => {
      addChild('Chain', 'get');
      addChild('Chain', 'eq');
      selectNode('Eq');

      cy.get('[data-testid=prop-index]').should('exist');
      cy.get('[data-testid=prop-selector]').should('not.exist');
    });

    it('an action with a subject asks for nothing more', () => {
      addChild('Chain', 'get');
      addChild('Chain', 'click');
      selectNode('Click');

      cy.get('[data-testid=prop-selector]').should('not.exist');
      cy.get('.property-editor__empty-note').should('exist');
    });

    it('an assertion keeps its own fields and loses only the selector', () => {
      addChild('Chain', 'get');
      addChild('Chain', 'should');
      selectNode('Assert');

      cy.get('[data-testid=prop-assertion]').should('exist');
      cy.get('[data-testid=prop-value]').should('exist');
      cy.get('[data-testid=prop-selector]').should('not.exist');
    });
  });

  context('a context-hidden field never becomes an unfixable warning (§31)', () => {
    it('raises no unresolved warning for a chained click with no selector', () => {
      addChild('Test Case', 'chain');
      addChild('Chain', 'get');
      selectNode('Get');
      setProp('selector', '.items');
      addChild('Chain', 'click');
      openCodeDrawer();

      cy.contains('[data-testid=tree-node]', 'Click').should(
        'not.have.class',
        'tree-node__row--unresolved',
      );
      cy.get('[data-testid=unresolved-warning]').should('not.contain.text', 'Click');
      cy.get('[data-testid=output-code]').should('contain.text', "cy.get('.items').click();");
    });

    it('still warns about the same command standalone', () => {
      addChild('Test Case', 'click');
      openCodeDrawer();

      cy.contains('[data-testid=tree-node]', 'Click').should(
        'have.class',
        'tree-node__row--unresolved',
      );
    });
  });
});
