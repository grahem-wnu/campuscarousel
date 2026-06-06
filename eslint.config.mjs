// Flat ESLint config (eslint v9). Base lint rules for the whole monorepo.
// Modules consume this; they do not need their own eslint config.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/cdk.out/**',
      '.worktrees/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node tooling / config scripts written in plain JS.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
