import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // The dev server (npm run dev) or preview (npm run preview) must be running.
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: false,
  },
});
