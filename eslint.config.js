import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['coverage', 'dist', 'node_modules']),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'globalThis', ...Object.keys(globals.browser)],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Domain code must access randomness through RandomSource.',
        },
        {
          selector: "MemberExpression[object.name='Math'][computed=true][property.value='random']",
          message: 'Domain code must access randomness through RandomSource.',
        },
        {
          selector: "VariableDeclarator[init.name='Math']",
          message: 'Do not alias Math in domain code; aliases can bypass the randomness boundary.',
        },
        {
          selector: "AssignmentExpression[right.name='Math']",
          message: 'Do not alias Math in domain code; aliases can bypass the randomness boundary.',
        },
      ],
    },
  },
])
