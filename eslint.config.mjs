import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'postgrestor.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      'require-jsdoc': 'off',
      'comma-dangle': ['error', 'never'],
      'new-cap': 'warn'
    }
  }
);