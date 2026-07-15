import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'docs/**', 'earth-engine/**', 'node_modules/**', 'website/**']
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', '.test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-unused-private-class-members': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['self'] }],
      'prefer-const': 'warn'
    }
  },
  {
    files: ['test/fixtures/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
);
