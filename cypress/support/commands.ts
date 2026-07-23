/**
 * Custom Cypress commands.
 *
 * All HTML5 drag-and-drop logic is isolated here. Cypress has no native
 * drag-and-drop command for HTML5 DnD, so `dragDrop` dispatches the synthetic
 * event sequence the application listens for, sharing a single DataTransfer across
 * events so the payload set on `dragstart` is still readable on `drop`.
 *
 * Firing `dragstart` also lets the application populate its transient drag state
 * (used for hover validation); `dragend` clears it, mirroring a real gesture.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Drag the element matched by `sourceSelector` onto the element matched by
       * `targetSelector` using synthetic HTML5 drag events.
       */
      dragDrop(sourceSelector: string, targetSelector: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add(
  'dragDrop',
  (sourceSelector: string, targetSelector: string) => {
    const dataTransfer = new DataTransfer();

    cy.get(sourceSelector).first().trigger('dragstart', { dataTransfer, force: true });
    cy.get(targetSelector)
      .first()
      .trigger('dragover', { dataTransfer, force: true })
      .trigger('drop', { dataTransfer, force: true });
    cy.get(sourceSelector).first().trigger('dragend', { dataTransfer, force: true });
  },
);

export {};
