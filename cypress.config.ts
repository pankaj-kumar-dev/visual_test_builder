import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // The dev server (npm run dev) or preview (npm run preview) must be running.
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: false,
    // Desktop-sized default (Phase 2 UI's own "desktop >= 1024px" reference size)
    // so ordinary specs land above the tablet breakpoint and aren't affected by
    // it; the responsive spec sets narrower viewports explicitly where it means to.
    viewportWidth: 1280,
    viewportHeight: 800,
  },
});
