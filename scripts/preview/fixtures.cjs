// Realistic deck state for rendering the UI without real sessions. Content is
// sized to the worst case (long names, long paths) so layouts are tested
// against what breaks them, not what flatters them.
const now = Date.now()
const min = 60_000

const pages = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    url: `http://example-site.test/?page_id=${4182 + i}`,
    title: [
      'Vacancy filter block — department and location facets',
      'Quote totals layout',
      'Accordion block with nested InnerBlocks and a very long title that wraps',
      'Hero variant B'
    ][i % 4],
    at: now - (i + 1) * 47 * min,
    sessionId: 's1',
    sessionName: i % 2 ? 'Refactor vacancy import' : null
  }))

const base = (o) => ({
  name: null, external: false, resumable: false, attached: true,
  activity: [], question: null, questionKind: null, testPages: [],
  branch: null, repoName: null, startedAt: now - 90 * min, updatedAt: now,
  projectKey: 'site-a', canReopen: false, nameSource: 'prompt',
  pullRequest: null, pullRequests: [], ticket: null, todos: [], processes: [], finished: [], appName: null,
  ...o, uid: o.id
})

exports.sessions = [
  base({
    id: 's1', name: 'Vacancy filter block with department facets', status: 'needs-you',
    project: { id: 'site-a', name: 'example-corporate', domain: 'example-corporate.test' },
    activity: ['> add a department filter to the vacancy block', 'Read  block.json', 'Grep  get_terms', 'Read  class-vacancy-query.php', 'Edit  render.php', 'Edit  edit.js', 'Bash  npm run build', 'Read  block.json', 'Edit  _vacancy-filter.scss', 'Bash  wp post create --post_type=page'],
    question: 'Claude needs your permission to use Bash', questionKind: 'permission_prompt',
    testPages: pages(6), branch: 'feature/EXC-207-vacancy-filter', repoName: 'example-theme',
    ticket: { key: 'EXC-207', url: 'https://example.atlassian.net/browse/EXC-207' },
    pullRequest: { url: 'https://bitbucket.org/example/example-theme/pull-requests/42', title: 'EXC-207 Vacancy department filter', branch: 'feature/EXC-207-vacancy-filter', at: now - 20 * min },
    pullRequests: [
      { id: 'pr1', url: 'https://bitbucket.org/example/example-theme/pull-requests/42', title: 'EXC-207 Vacancy department filter', branch: 'feature/EXC-207-vacancy-filter', at: now - 20 * min, sessionName: 'Vacancy filter block with department facets' },
      { id: 'pr2', url: 'https://bitbucket.org/example/example-theme/pull-requests/39', title: null, branch: 'bugfix/EXC-198-quote-padding', at: now - 26 * 60 * min, sessionName: 'Chrome padding on the quote page' },
      { id: 'pr3', url: 'https://bitbucket.org/example/example-theme/pull-requests/35', title: 'EXC-190 Footer navigation spacing', branch: 'feature/EXC-190-footer-nav', at: now - 4 * 24 * 60 * min, sessionName: null }
    ],
    todos: [
      { id: 't1', text: 'Clear the page cache on staging after deploying', done: false, at: now - 30 * min, sessionName: 'Vacancy filter block with department facets', source: 'claude' },
      { id: 't2', text: 'Check the filter on iOS Safari — the select element renders natively there', done: false, at: now - 25 * min, sessionName: 'Vacancy filter block with department facets', source: 'claude' },
      { id: 't3', text: 'Move EXC-207 to review', done: true, at: now - 90 * min, doneAt: now - 10 * min, sessionName: null, source: 'user' }
    ],
    processes: [
      { pid: 101, command: 'npm run watch', description: 'Watch and rebuild theme assets', taskId: 'b1', background: true, startedAt: now - 41 * min, running: ['node vite build --watch'] },
      { pid: 102, command: 'composer install --no-interaction', description: null, taskId: null, background: false, startedAt: now - 38000, running: ['php composer.phar install'] }
    ],
    finished: [{ pid: 99, command: 'npm ci', description: 'Install dependencies', background: true, startedAt: now - 50 * min, endedAt: now - 47 * min, running: [] }]
  }),
  base({
    id: 's2', name: 'Accessible form labels', status: 'working',
    project: { id: 'site-b', name: 'example-foundation', domain: 'example-foundation.test' },
    activity: ['> fix the contact form label associations', 'Edit  block-contact-form.php', 'Edit  _form.scss', 'Bash  npm run build'],
    branch: 'bugfix/EXF-88-form-labels', repoName: 'foundation-plugin',
    ticket: { key: 'EXF-88', url: null }
  }),
  base({
    id: 's3', name: 'Clear PHP 8.3 deprecations', status: 'done',
    project: { id: 'site-c', name: 'example-municipality', domain: 'example-municipality.test' },
    activity: ['Grep  strlen(null)', 'Edit  class-vacancy-import.php', 'Edit  class-feed.php'],
    testPages: pages(1), branch: 'staging', repoName: 'municipality-theme'
  }),
  base({
    id: 's4', name: 'Figma review of the header', status: 'working', external: true, attached: false,
    project: { id: null, name: 'example-starter', domain: 'not a Local site' },
    activity: ['Read  header.php'], branch: 'main', repoName: 'example-starter', appName: 'Terminal'
  }),
  base({
    id: 's5', name: 'Cookie banner consent fix', status: 'resumable', resumable: true, attached: false,
    project: { id: 'site-d', name: 'example-service', domain: 'example-service.test' },
    canReopen: true
  }),
  base({
    id: 's6', name: 'Header navigation spacing', status: 'closed', attached: false,
    project: { id: 'site-a', name: 'example-corporate', domain: 'example-corporate.test' },
    canReopen: false, branch: 'develop', repoName: 'example-theme'
  })
]

exports.repos = [
  {
    root: '/sites/example-corporate/wp-content/themes/example-theme', name: 'example-theme',
    branch: 'feature/EXC-207-vacancy-filter', touched: true,
    files: [
      { path: 'blocks/vacancy-list/block.json', code: 'M', group: 'staged' },
      { path: 'blocks/vacancy-list/render.php', code: 'M', group: 'staged' },
      { path: 'blocks/vacancy-list/render.php', code: 'M', group: 'unstaged' },
      { path: 'blocks/vacancy-list/src/components/DepartmentFilter.jsx', code: '?', group: 'untracked' },
      { path: 'assets/scss/components/_vacancy-filter.scss', code: 'M', group: 'unstaged' }
    ]
  },
  {
    root: '/sites/example-corporate/wp-content/plugins/example-core', name: 'example-core',
    branch: 'staging', touched: false,
    files: [{ path: 'src/class-feed.php', code: 'M', group: 'unstaged' }]
  }
]

exports.diff = `diff --git a/blocks/vacancy-list/render.php b/blocks/vacancy-list/render.php
index 3f1c2aa..9b0e4d1 100644
--- a/blocks/vacancy-list/render.php
+++ b/blocks/vacancy-list/render.php
@@ -12,9 +12,14 @@ $vacancies = get_posts( $args );
 <div <?php echo get_block_wrapper_attributes(); ?>>
-	<ul class="vacancy-list">
+	<?php if ( ! empty( $attributes['showDepartmentFilter'] ) ) : ?>
+		<?php get_template_part( 'template-parts/vacancy-filter' ); ?>
+	<?php endif; ?>
+
+	<ul class="vacancy-list" data-department="<?php echo esc_attr( $department ); ?>">
 		<?php foreach ( $vacancies as $vacancy ) : ?>
`

exports.summary = `## Goal
Add a department filter to the vacancy block (EXC-207).

## Done
- Added a \`department\` facet to \`class-vacancy-query.php\`, reusing the existing taxonomy query
- New select in \`render.php\` and \`edit.js\`; styles in \`_vacancy-filter.scss\`
- Built the assets and made a test page with WP-CLI

## State
Waiting on you: Claude asked permission to run \`wp post create\` for a second test page.

## Next
- Check the filter on iOS Safari
- Clear the page cache on staging after deploying`

// Composer dialog: one ticket package per state, others with and without updates.
const composerEnv = (label, branch, ticket, dot, extra = {}) => ({
  label, branch, missing: false, onRemote: true, error: null, dot, outdated: null,
  packages: [
    ...ticket,
    { name: 'example/core-plugin', ticket: false, version: '2.1.0', ref: 'a96c36e', constraint: '^2.1', pin: 'range' },
    { name: 'example/forms', ticket: false, version: `dev-${branch}`, ref: 'f00ba12', devBranch: branch, constraint: `dev-${branch}`, pin: 'branch' },
    { name: 'johnpbloch/wordpress', ticket: false, version: '6.9.7', ref: '596eaa6', constraint: '6.9.*', pin: 'range' },
    { name: 'wpackagist-plugin/redirection', ticket: false, version: '5.5.2', ref: null, constraint: '5.5.2', pin: 'pinned' },
    { name: 'wpackagist-plugin/wordfence', ticket: false, version: '8.2.2', ref: null, constraint: '8.2.2', pin: 'pinned' },
    { name: 'yoast/wordpress-seo', ticket: false, version: '28.1', ref: '4bbb0ab', constraint: '>=28', pin: 'open' }
  ],
  ...extra
})
const composerTheme = (branch, status, text, extra = {}) => ({
  name: 'example/corporate-theme', ticket: true, version: `dev-${branch}`, ref: 'a1b2c3d', branches: 1, constraint: `dev-${branch}`, pin: 'branch', tip: 'feature/EXC-207', status, text, ...extra
})
const composerBlock = (status, text, extra = {}) => ({
  name: 'example/quotation-block', ticket: true, version: '1.4.0', ref: '9f8e7d6', branches: 2, constraint: '^1.4', pin: 'range', tip: 'feature/EXC-207', status, text, ...extra
})
exports.composer = {
  ok: true,
  root: '/Users/you/Local Sites/example-corporate/app',
  current: 'feature/EXC-207',
  ticket: 'EXC-207',
  ticketRepos: 2,
  unmatched: [],
  warnings: [],
  workflow: { id: 'test-staging-live', name: 'Test, staging, live', source: 'default' },
  workflows: [{ id: 'current', name: 'Current branch only' }, { id: 'test-staging-live', name: 'Test, staging, live' }],
  defaultWorkflowId: 'test-staging-live',
  environments: [
    composerEnv('Test', 'develop', [
      composerTheme('develop', 'behind', 'merged, lock behind', { newest: 'f4e5d6c', behindBy: 3 }),
      composerBlock('behind', 'released in 1.5.0, lock behind', { newest: '1.5.0' })
    ], 'behind'),
    composerEnv('Staging', 'staging', [
      composerTheme('staging', 'not-merged', 'not merged into staging yet'),
      composerBlock('untagged', 'merged, no release tag yet')
    ], 'not-merged'),
    composerEnv('Live', 'master', [
      composerTheme('master', 'not-merged', 'not merged into master yet'),
      composerBlock('not-merged', 'feature/EXC-207-feedback: not merged or released yet')
    ], 'not-merged')
  ]
}
exports.composerOutdated = {
  'example/core-plugin': { latest: '2.2.0', status: 'semver-safe-update' },
  'example/forms': { latest: 'dev-develop f00ba12', status: 'up-to-date' },
  'johnpbloch/wordpress': { latest: '7.1.4', status: 'update-possible' },
  'wpackagist-plugin/redirection': { latest: '5.5.2', status: 'up-to-date' },
  'wpackagist-plugin/wordfence': { latest: '8.3.0', status: 'update-possible' },
  'yoast/wordpress-seo': { latest: '28.1', status: 'up-to-date' }
}
exports.workflow = {
  defaultId: 'test-staging-live',
  custom: [{ id: 'custom-legacy', name: 'Legacy (acc)', environments: [{ label: 'Test', branch: 'develop' }, { label: 'Acceptance', branch: 'acc' }, { label: 'Live', branch: 'master' }] }],
  overrides: { 'site-1': 'custom-legacy' },
  projectNames: { 'site-1': 'example-legacy' },
  workflows: [
    { id: 'current', name: 'Current branch only', preset: true, environments: null },
    { id: 'test-staging-live', name: 'Test, staging, live', preset: true, environments: [{ label: 'Test', branch: 'develop' }, { label: 'Staging', branch: 'staging' }, { label: 'Live', branch: 'master' }] },
    { id: 'custom-legacy', name: 'Legacy (acc)', environments: [{ label: 'Test', branch: 'develop' }, { label: 'Acceptance', branch: 'acc' }, { label: 'Live', branch: 'master' }] }
  ]
}

// The update on develop, in each of its stages.
const opBase = {
  root: '/Users/you/Local Sites/example-corporate/app', branch: 'develop', remote: 'origin', busy: false,
  worktree: '/Users/you/.session-deck/worktrees/3f9c2a1b7e/develop',
  packages: ['example/corporate-theme', 'example/quotation-block'], failed: null, review: null, commit: null, note: null
}
const t0 = Date.now() - 60e3
const okSteps = [
  { id: 1, kind: 'prepare', title: 'Fetch origin', cmd: 'git fetch --quiet origin', startedAt: t0, endedAt: t0 + 1400, code: 0, output: '', truncated: false },
  { id: 2, kind: 'prepare', title: 'Reset worktree to origin/develop', cmd: 'git checkout --quiet --force --detach refs/remotes/origin/develop', startedAt: t0 + 1500, endedAt: t0 + 1700, code: 0, output: '', truncated: false },
  { id: 3, kind: 'update', title: 'composer update', cmd: 'composer update example/corporate-theme example/quotation-block --no-install', startedAt: t0 + 1800, endedAt: t0 + 19800, code: 0, output: 'Loading composer repositories with package information\nUpdating dependencies\nLock file operations: 0 installs, 2 updates, 0 removals\n  - Upgrading example/corporate-theme (dev-develop a1b2c3d => dev-develop f4e5d6c)\n  - Upgrading example/quotation-block (1.4.0 => 1.5.0)\nWriting lock file\n', truncated: false }
]
const review = {
  changes: [
    { name: 'example/corporate-theme', from: 'dev-develop a1b2c3d', to: 'dev-develop f4e5d6c' },
    { name: 'example/quotation-block', from: '1.4.0', to: '1.5.0' },
    { name: 'example/shared-helpers', from: '2.0.1', to: '2.0.3' }
  ],
  unexpected: ['example/shared-helpers'], files: ['composer.lock'], otherFiles: [],
  message: 'EXC-207 composer update corporate-theme, quotation-block'
}
exports.composerOps = {
  review: { ...opBase, stage: 'review', steps: okSteps, review },
  committed: { ...opBase, stage: 'committed', steps: [...okSteps,
    { id: 4, kind: 'commit', title: 'Stage changes', cmd: 'git add --update', startedAt: t0 + 30e3, endedAt: t0 + 30.1e3, code: 0, output: '', truncated: false },
    { id: 5, kind: 'commit', title: 'Commit', cmd: 'git commit -m "EXC-207 composer update corporate-theme, quotation-block"', startedAt: t0 + 30.2e3, endedAt: t0 + 30.5e3, code: 0, output: '[detached HEAD 6669e93] EXC-207 composer update corporate-theme, quotation-block\n 1 file changed, 6 insertions(+), 6 deletions(-)\n', truncated: false }
  ], review, commit: { sha: '6669e93', message: 'EXC-207 composer update corporate-theme, quotation-block', ahead: 1 } },
  failed: { ...opBase, stage: 'failed', steps: [okSteps[0], okSteps[1],
    { id: 3, kind: 'update', title: 'composer update', cmd: 'composer update example/corporate-theme example/quotation-block --no-install', startedAt: t0 + 1800, endedAt: t0 + 9800, code: 2, output: 'Loading composer repositories with package information\nUpdating dependencies\nYour requirements could not be resolved to an installable set of packages.\n\n  Problem 1\n    - Root composer.json requires example/quotation-block ^1.4 -> satisfiable by example/quotation-block[1.4.0, 1.5.0].\n    - example/quotation-block 1.5.0 requires php >=8.3 -> your php version (8.1.29) does not satisfy that requirement.\n', truncated: false }
  ], failed: { stepId: 3, kind: 'update', message: 'composer update failed on develop (exit 2).' } },
  running: { ...opBase, stage: 'running', busy: true, steps: [okSteps[0], okSteps[1], { ...okSteps[2], endedAt: null, code: null, output: 'Loading composer repositories with package information\n' }] }
}

exports.lockDiff = [
  'diff --git a/composer.lock b/composer.lock',
  'index 3c1e2f0..9a7b4d1 100644',
  '--- a/composer.lock',
  '+++ b/composer.lock',
  '@@ -4,7 +4,7 @@',
  '         "Read more about it at https://getcomposer.org/doc/01-basic-usage.md#installing-dependencies",',
  '         "This file is @generated automatically"',
  '     ],',
  '-    "content-hash": "8f2d0c4e9b1a7f3e6d5c2b1a0f9e8d7c",',
  '+    "content-hash": "8f2d0c4e9b1a7f3e6d5c2b1a0f9e8d7c",',
  '     "packages": [',
  '@@ -112,12 +112,12 @@',
  '             "name": "example/corporate-theme",',
  '             "version": "dev-develop",',
  '             "source": {',
  '                 "type": "git",',
  '                 "url": "git@bitbucket.org:example/corporate-theme.git",',
  '-                "reference": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"',
  '+                "reference": "f4e5d6c7b8a90123456789abcdef0123456789ab"',
  '             },',
  '-            "time": "2026-10-21T09:12:44+00:00",',
  '+            "time": "2026-10-30T14:03:10+00:00",',
  '             "type": "wordpress-theme",',
  '@@ -240,13 +240,13 @@',
  '             "name": "example/quotation-block",',
  '-            "version": "1.4.0",',
  '+            "version": "1.5.0",',
  '             "source": {',
  '                 "type": "git",',
  '                 "url": "git@bitbucket.org:example/quotation-block.git",',
  '-                "reference": "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432"',
  '+                "reference": "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567"',
  '             },'
].join('\n')
