/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // new feature
        'fix', // bug fix
        'docs', // documentation only
        'style', // formatting, missing semicolons (no code change)
        'refactor', // refactor without behavior change
        'perf', // performance improvement
        'test', // adding or fixing tests
        'build', // build system or dependencies
        'ci', // CI configuration changes
        'chore', // other maintenance (no src/test change)
        'revert', // revert a previous commit
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
};
