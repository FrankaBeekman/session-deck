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
