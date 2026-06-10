import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'postgrestor.js',
      'postgrestor.html',
      'node_modules/**',
      'coverage/**',
      '.planning/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'postgrestor.ts'],
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        console: 'readonly',
        RED: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'require-jsdoc': 'off',
      'comma-dangle': ['error', 'never'],
      'new-cap': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off'
    }
  }
);