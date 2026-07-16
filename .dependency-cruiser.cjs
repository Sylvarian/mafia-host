/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      comment: 'Cycles obscure ownership and make layer direction unreliable.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolvable-imports',
      comment: 'Every import must resolve consistently in local development and CI.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'domain-only-depends-on-domain',
      comment: 'Domain code must remain framework-independent and at the bottom of the graph.',
      severity: 'error',
      from: { path: '(^|/)src/domain/' },
      to: { path: '(^|/)src/(?!domain/)' },
    },
    {
      name: 'domain-has-no-ui-dependencies',
      comment: 'Domain code cannot import React, routing libraries, or style sheets.',
      severity: 'error',
      from: { path: '(^|/)src/domain/' },
      to: {
        path: '(^|/)node_modules/(react|react-dom|react-router|react-router-dom)(/|$)|\\.(css|less|s[ac]ss)$',
      },
    },
    {
      name: 'application-only-depends-on-domain',
      comment: 'Application coordination may depend on domain contracts, never UI or adapters.',
      severity: 'error',
      from: { path: '(^|/)src/application/' },
      to: { path: '(^|/)src/(?!application/|domain/)' },
    },
    {
      name: 'application-has-no-ui-dependencies',
      comment: 'Application code cannot contain React, routing, or visual styling concerns.',
      severity: 'error',
      from: { path: '(^|/)src/application/' },
      to: {
        path: '(^|/)node_modules/(react|react-dom|react-router|react-router-dom)(/|$)|\\.(css|less|s[ac]ss)$',
      },
    },
    {
      name: 'ui-uses-application-api',
      comment: 'UI code must not bypass application APIs to import the domain directly.',
      severity: 'error',
      from: {
        path: '(^|/)src/',
        pathNot: '(^|/)src/(domain|application|infrastructure)/',
      },
      to: { path: '(^|/)src/domain/' },
    },
    {
      name: 'feature-slices-are-isolated',
      comment: 'One feature can only use another through its public index.',
      severity: 'error',
      from: { path: '((?:^|/)src/features/)([^/]+)/' },
      to: { path: '$1', pathNot: '$1$2/|$1[^/]+/index[.][cm]?[jt]sx?$' },
    },
    {
      name: 'shared-ui-is-presentational',
      comment: 'Shared UI cannot depend on game layers, feature internals, or adapters.',
      severity: 'error',
      from: { path: '(^|/)src/shared/ui/' },
      to: { path: '(^|/)src/(application|domain|features|infrastructure|routes?)/' },
    },
    {
      name: 'production-does-not-import-tests',
      comment: 'Production modules cannot depend on test modules or fixtures.',
      severity: 'error',
      from: { path: '^src/', pathNot: '[.]test[.][cm]?[jt]sx?$' },
      to: { path: '(^|/)tests?/|[.]test[.][cm]?[jt]sx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      conditionNames: ['types', 'import', 'default'],
    },
  },
}
