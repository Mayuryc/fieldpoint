module.exports = [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { URLSearchParams: 'readonly', setInterval: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', window: 'readonly' } },
  rules: { 'no-unused-vars': 'warn', 'no-undef': 'error', eqeqeq: ['warn', 'always'], 'no-var': 'error', 'prefer-const': 'warn' },
}, { ignores: ['k6/**', 'node_modules/**', 'coverage/**', 'public/**'] }];
