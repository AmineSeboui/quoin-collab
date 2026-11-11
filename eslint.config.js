import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Type-aware from the start. The rules worth having here are the ones that need the type checker, such as a
 * promise nobody awaited, and a lint that cannot see types mostly repeats what the compiler already said.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // `void somePromise()` is how this codebase says "started on purpose, not awaited", so let it.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // The server deals in `unknown` from sockets and JSON, where a narrowing cast is the honest move.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      // Persistence, Fanout and Meter all promise a Promise. An implementation that happens to be synchronous
      // is still correct, and rewriting it to satisfy a lint would be the lint deciding the interface.
      '@typescript-eslint/require-await': 'off',
      // Yjs declares no toString on its shared types, so every `doc.getText(...)` in a string reads to this
      // rule as an Object. It is the type declarations that are thin, not the code.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  {
    files: ['**/*.test.ts', 'packages/*/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // A test reaches for a method of somebody else's object on purpose.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['eslint.config.js', '**/*.config.ts', '**/*.config.js', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly' } },
  },
);
