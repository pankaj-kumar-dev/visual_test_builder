/**
 * Smoke — Phase 4 network (intercept/waitAlias/request): the ordering lint
 * (intercept must be followed by a triggering action before the wait) and the
 * reference picker offering an alias produced by `intercept.as` — the exact
 * same Phase 3 mechanism, exercised end to end through a real drag/drop build.
 *
 * Generator correctness (exact output) is covered by
 * src/engine/processFlow.test.ts's Phase 4 golden flow; this spec only checks
 * what needs a real browser.
 */

import {
  addChild,
  addRoot,
  nodeIdByLabel,
  openCodeDrawer,
  selectNode,
  setProp,
} from '../support/flows';

describe('Network (Phase 4)', () => {
  beforeEach(() => {
    cy.visitApp();
    addRoot('describe');
    selectNode('Describe Block');
    setProp('label', 'Brands');
    addChild('Describe Block', 'it');
    selectNode('Test Case');
    setProp('label', 'loads the brand list');
  });

  it('intercept.as -> visit -> waitAlias generates the correct code with no semantic issue', () => {
    addChild('Test Case', 'chain');
    addChild('Chain', 'intercept');
    selectNode('Intercept');
    cy.get('[data-testid=prop-method]').select('GET');
    setProp('url', '/api/brands');
    addChild('Chain', 'as');
    selectNode('As (save alias)');
    setProp('name', 'getBrands');

    addChild('Test Case', 'visit');
    selectNode('Visit');
    setProp('url', '/brands');

    addChild('Test Case', 'waitAlias');
    selectNode('Wait for Alias');

    // The picker offers the alias intercept.as produced.
    cy.get('[data-testid=prop-alias-reference-picker]').select('getBrands');
    cy.get('[data-testid=prop-alias]').should('have.value', '@getBrands');

    openCodeDrawer();
    cy.get('[data-testid=semantic-warning]').should('not.exist');
    const expected = `describe('Brands', () => {
  it('loads the brand list', () => {
    cy.intercept('GET', '/api/brands').as('getBrands');
    cy.visit('/brands');
    cy.wait('@getBrands');
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('intercept.as -> waitAlias with no action in between is flagged by the ordering lint', () => {
    addChild('Test Case', 'chain');
    addChild('Chain', 'intercept');
    selectNode('Intercept');
    setProp('url', '/api/brands');
    addChild('Chain', 'as');
    selectNode('As (save alias)');
    setProp('name', 'getBrands');

    addChild('Test Case', 'waitAlias');
    selectNode('Wait for Alias');
    setProp('alias', '@getBrands');

    cy.contains('[data-testid=tree-node]', 'Wait for Alias').should(
      'have.attr',
      'data-semantic-issue',
      'true',
    );

    openCodeDrawer();
    cy.get('[data-testid=semantic-warning]').should('contain.text', 'no action');
  });

  it('request with method and body generates the object-literal call', () => {
    addChild('Test Case', 'request');
    selectNode('Request');
    cy.get('[data-testid=prop-method]').select('POST');
    setProp('url', '/api/brands');
    // Contains literal braces, which cy.type() would otherwise parse as a
    // special-character sequence.
    cy.get('[data-testid=prop-body]').clear().type("{ name: 'Acme' }", { parseSpecialCharSequences: false });

    openCodeDrawer();
    const expected = `describe('Brands', () => {
  it('loads the brand list', () => {
    cy.request({
      method: 'POST',
      url: '/api/brands',
      body: { name: 'Acme' }
    });
  });
});`;
    cy.get('[data-testid=output-code]').should(($el) => {
      expect($el.text().trim()).to.eq(expected);
    });
  });

  it('a click placed between intercept and wait clears the ordering warning', () => {
    addChild('Test Case', 'chain');
    addChild('Chain', 'intercept');
    selectNode('Intercept');
    setProp('url', '/api/brands');
    addChild('Chain', 'as');
    selectNode('As (save alias)');
    setProp('name', 'getBrands');

    // Build without the trigger first, to confirm the warning appears...
    addChild('Test Case', 'waitAlias');
    selectNode('Wait for Alias');
    setProp('alias', '@getBrands');
    openCodeDrawer();
    cy.get('[data-testid=semantic-warning]').should('exist');

    // ...then insert the click in between via reorder (drag/drop only inserts
    // new nodes at the end; existing nodes are moved via the sibling drop zone).
    addChild('Test Case', 'click');
    selectNode('Click');
    setProp('selector', '#load');

    nodeIdByLabel('Test Case').then((itId) => {
      nodeIdByLabel('Click').then((clickId) => {
        cy.dragDrop(`[data-node-id="${clickId}"]`, `[data-parent-id="${itId}"][data-before-index="1"]`);
      });
    });

    cy.get('[data-testid=semantic-warning]').should('not.exist');
  });
});
