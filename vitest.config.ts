import { defineConfig } from 'vitest/config';

// Unit layer for pure functions (engine, registry) — see docs/TEST_PLAN.md §5,
// which recommends Vitest for this layer ("native Vite integration, zero extra
// bundler config"). Node environment is sufficient: nothing under test touches
// the DOM or React.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
