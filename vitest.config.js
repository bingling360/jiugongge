import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['libs/**/*.js'],
      exclude: ['libs/thirdparty/**'],
    },
    setupFiles: ['./tests/setup.js'],
  },
});
