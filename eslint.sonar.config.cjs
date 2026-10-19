// Análisis estático con las reglas de SonarJS (el mismo conjunto de reglas de JavaScript de SonarQube)
const sonarjs = require('eslint-plugin-sonarjs');
const globals = { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly', console: 'readonly', Buffer: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', document: 'readonly', window: 'readonly', sessionStorage: 'readonly', FileReader: 'readonly', confirm: 'readonly', alert: 'readonly', location: 'readonly', Intl: 'readonly' };
module.exports = [
  sonarjs.configs.recommended,
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals } },
  { ignores: ['node_modules/**', 'coverage/**', 'tests/**', 'dist/**'] },
];
