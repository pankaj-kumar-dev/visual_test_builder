/**
 * Flow-building helpers for smoke specs.
 *
 * These compose the isolated `cy.dragDrop` command with clicks and typing to build
 * flows through the real UI. Tree rows are targeted by their unique data-node-id,
 * resolved from the visible registry label (which the canvas renders on each row).
 */

/** Resolve a node's unique id from its rendered label. */
export function nodeIdByLabel(label: string): Cypress.Chainable<string> {
  return cy
    .contains('[data-testid=tree-node]', label)
    .invoke('attr', 'data-node-id')
    .then((id) => id as string);
}

/** Drop a new node of `type` onto the empty canvas (becomes the root). */
export function addRoot(type: string): void {
  cy.dragDrop(`[data-testid=palette-item-${type}]`, '[data-testid=canvas]');
}

/**
 * Drop a new node of `type` as a child of the node with the given label.
 *
 * Waits for the tree's total row count to increase by one before returning
 * (Cypress's retrying `.should()`), rather than assuming the drop's React commit
 * has already landed by the time the next command runs. This matters more from
 * Phase 2 on: a chain's own drop validation reads the *current* sibling list
 * (`node.children`) to decide root-vs-continuation legality, so a consecutive
 * drop that reads it one render too early can be wrongly rejected — the tree
 * still ends up correct once settled, but a chained sequence of `addChild` calls
 * with no wait between them could observe a stale sibling count.
 */
export function addChild(parentLabel: string, type: string): void {
  cy.get('[data-testid=tree-node]')
    .its('length')
    .then((before) => {
      nodeIdByLabel(parentLabel).then((id) => {
        cy.dragDrop(`[data-testid=palette-item-${type}]`, `[data-node-id="${id}"]`);
      });
      cy.get('[data-testid=tree-node]').should('have.length', before + 1);
    });
}

/** Collapse or expand the node with the given label (Scalable Builder UI). */
export function toggleCollapse(label: string): void {
  cy.contains('[data-testid=tree-node]', label)
    .find('[data-testid=node-toggle]')
    .click();
}

/** Type into the palette search box, replacing whatever is there. */
export function searchPalette(query: string): void {
  cy.get('[data-testid=palette-search]').clear().type(query);
}

/** Select the node with the given label. */
export function selectNode(label: string): void {
  nodeIdByLabel(label).then((id) => {
    cy.get(`[data-node-id="${id}"]`).click();
  });
}

/** Set a property field (the corresponding node must be selected). */
export function setProp(key: string, value: string): void {
  cy.get(`[data-testid=prop-${key}]`).clear().type(value);
}

/** Open the code drawer via the header toggle (Phase 2 UI). No-op if already open. */
export function openCodeDrawer(): void {
  cy.get('body').then(($body) => {
    if ($body.find('[data-testid=code-drawer]').length === 0) {
      cy.get('[data-testid=code-toggle]').click();
    }
  });
  cy.get('[data-testid=code-drawer]').should('exist');
}

/**
 * Build the HLD §8/§12 "Login Suite" flow with all required properties filled.
 * Tree rows keep their registry labels (Describe Block / Test Case / Type / Click)
 * regardless of property values, so selection by label stays valid.
 */
export function buildLoginFlow(): void {
  addRoot('describe');
  selectNode('Describe Block');
  setProp('label', 'Login Suite');

  addChild('Describe Block', 'it');
  selectNode('Test Case');
  setProp('label', 'Successful Login');

  addChild('Test Case', 'type');
  selectNode('Type');
  setProp('selector', '#username');
  setProp('value', 'admin');

  addChild('Test Case', 'click');
  selectNode('Click');
  setProp('selector', '#login');
}
