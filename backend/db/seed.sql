-- ============================================================
-- Tech4Rum — demo seed data
--
-- Run AFTER schema.sql, on an empty database:
--   psql "$DATABASE_URL" -f backend/db/schema.sql
--   psql "$DATABASE_URL" -f backend/db/seed.sql
--
-- Uses pgcrypto for bcrypt hashing at insert time. Every account
-- below logs in with password "password123".
--
-- Counts:
--   24 users      (3 admins, 5 moderators, 16 members; 1 suspended, 1 banned)
--   55 tags
--   52 posts      (26 questions, 26 discussions)
--   35 answers    (spread across 20 questions; 6 questions unanswered)
--   105 comments  (30 on questions, 25 on answers, 50 threaded discussion replies)
--   6 reports     (spam, off-topic, abuse, plagiarism, duplicate, discussion off-topic)
--   5 post marks  (violated, off-topic, duplicated, spam)
--   ~200 votes    (deterministic pattern, ~10% downvotes)
--   ~30 follows   (deterministic pattern)
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Users (24)
-- ============================================================
INSERT INTO users (id, email, password_hash, username, display_name, bio, website, location, reputation, role, status, suspended_until, created_at, updated_at) VALUES
  (1,  'ada@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'ada_lovelace',      'Ada Lovelace',       'Mathematician and writer. Wrote the first algorithm intended for a machine.', 'https://ada.example.com', 'London, UK',     12480, 'admin',     'active',    NULL,                          NOW() - INTERVAL '500 days', NOW() - INTERVAL '500 days'),
  (2,  'raj@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'dba_raj',           'Raj Mehta',          'Postgres-only DBA for eight years. Occasionally strays.', 'https://raj.dev', 'Bengaluru, IN', 24900, 'admin',     'active',    NULL,                          NOW() - INTERVAL '450 days', NOW() - INTERVAL '450 days'),
  (3,  'buidut@tech4rum.io', crypt('password123', gen_salt('bf', 10)), 'buidut',            'Bùi Đụt',            'Backend developer and technology enthusiast.', '', 'Hà Nội, VN',             125, 'admin',     'active',    NULL,                          NOW() - INTERVAL '60 days',  NOW() - INTERVAL '60 days'),
  (4,  'kenji@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'kenji_rs',          'Kenji Sato',         'Systems programmer. Writes Rust for fun and Go for money.', 'https://kenji.example', 'Tokyo, JP',      3460, 'moderator', 'active',    NULL,                          NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days'),
  (5,  'lena@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'lena_ts',           'Lena Chen',          'TypeScript everywhere. Comfortable with Go and Rust on weekends.', '', 'Shenzhen, CN',         8017, 'moderator', 'active',    NULL,                          NOW() - INTERVAL '380 days', NOW() - INTERVAL '380 days'),
  (6,  'mira@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'mira_k',            'Mira Kapoor',        'Frontend engineer. React, CSS, and accessibility.', '', 'Delhi, IN',            1284, 'moderator', 'active',    NULL,                          NOW() - INTERVAL '300 days', NOW() - INTERVAL '300 days'),
  (7,  'nguyen@tech4rum.io', crypt('password123', gen_salt('bf', 10)), 'nguyen_dev',        'Nguyễn Văn Dev',     'Python developer. Learning Rust on weekends.', 'https://nguyen.dev', 'Hà Nội, VN',    340, 'moderator', 'active',    NULL,                          NOW() - INTERVAL '240 days', NOW() - INTERVAL '240 days'),
  (8,  'priya@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'priya_dev',         'Priya Sharma',       'DevOps engineer. Docker, K8s, and the occasional postmortem.', '', 'Bangalore, IN',         742, 'moderator', 'active',    NULL,                          NOW() - INTERVAL '220 days', NOW() - INTERVAL '220 days'),
  (9,  'nova@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'nova_css',          'Nova Rodríguez',     'CSS specialist. Container queries and design systems.', '', 'Barcelona, ES',         521, 'user',      'active',    NULL,                          NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days'),
  (10, 'smart@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'smart_calendar',    'Smart Calendar',     'Just here for the memes.', '', 'Everywhere',             36, 'user',      'active',    NULL,                          NOW() - INTERVAL '180 days', NOW() - INTERVAL '180 days'),
  (11, 'linh@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'linh_it',           'Linh IT',            'Computer science student.', '', 'Hồ Chí Minh, VN',        85, 'user',      'active',    NULL,                          NOW() - INTERVAL '150 days', NOW() - INTERVAL '150 days'),
  (12, 'an@tech4rum.io',     crypt('password123', gen_salt('bf', 10)), 'an_dev',            'An Dev',             'Backend developer curious about distributed systems.', '', 'Đà Nẵng, VN',           420, 'user',      'active',    NULL,                          NOW() - INTERVAL '140 days', NOW() - INTERVAL '140 days'),
  (13, 'bob@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'bob_coder',         'Bob Coder',          'Django and FastAPI. Likes boring technology.', '', 'Berlin, DE',              880, 'user',      'active',    NULL,                          NOW() - INTERVAL '130 days', NOW() - INTERVAL '130 days'),
  (14, 'carol@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'carol_test',        'Carol Test',         'QA engineer. TDD evangelist (recovering).', '', 'Toronto, CA',             640, 'user',      'active',    NULL,                          NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days'),
  (15, 'dave@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'dave_rust',         'Dave Rust',          'Rust and embedded. Borrow checker therapist.', '', 'Portland, US',            950, 'user',      'active',    NULL,                          NOW() - INTERVAL '110 days', NOW() - INTERVAL '110 days'),
  (16, 'eve@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'eve_py',            'Eve Python',         'Python and pytest. Mostly async these days.', '', 'Amsterdam, NL',           310, 'user',      'active',    NULL,                          NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days'),
  (17, 'frank@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'frank_js',          'Frank JS',           'JavaScript generalist. Bundler archaeology.', '', 'Austin, US',              760, 'user',      'active',    NULL,                          NOW() - INTERVAL '90 days',  NOW() - INTERVAL '90 days'),
  (18, 'grace@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'grace_ops',         'Grace Ops',          'Platform engineering. AWS, K8s, serverless.', '', 'Seattle, US',            1100, 'user',      'active',    NULL,                          NOW() - INTERVAL '80 days',  NOW() - INTERVAL '80 days'),
  (19, 'henry@tech4rum.io',  crypt('password123', gen_salt('bf', 10)), 'henry_ml',          'Henry ML',           'Training small transformers and pondering life.', '', 'Boston, US',              480, 'user',      'active',    NULL,                          NOW() - INTERVAL '70 days',  NOW() - INTERVAL '70 days'),
  (20, 'iris@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'iris_db',           'Iris DB',            'MongoDB and Postgres. Redis for fun.', '', 'Singapore, SG',             590, 'user',      'active',    NULL,                          NOW() - INTERVAL '60 days',  NOW() - INTERVAL '60 days'),
  (21, 'jack@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'jack_web',          'Jack Web',           'GraphQL and WebSockets. HTTP/3 believer.', '', 'Melbourne, AU',           720, 'user',      'active',    NULL,                          NOW() - INTERVAL '50 days',  NOW() - INTERVAL '50 days'),
  (22, 'kate@tech4rum.io',   crypt('password123', gen_salt('bf', 10)), 'kate_mobile',       'Kate Mobile',        'React Native and Swift. Mobile UX nerd.', '', 'Kyiv, UA',                430, 'user',      'active',    NULL,                          NOW() - INTERVAL '40 days',  NOW() - INTERVAL '40 days'),
  (23, 'leo@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'leo_git',           'Leo Git',            'Git plumber. Rebase enthusiast.', '', 'Warsaw, PL',                340, 'user',      'suspended', NOW() + INTERVAL '7 days',     NOW() - INTERVAL '30 days',  NOW() - INTERVAL '1 day'),
  (24, 'mia@tech4rum.io',    crypt('password123', gen_salt('bf', 10)), 'mia_ui',            'Mia UI',             'Tailwind and design tokens. Banned for repeated spam.', '', 'Paris, FR',               -50, 'user',      'banned',    NULL,                          NOW() - INTERVAL '20 days',  NOW() - INTERVAL '2 days');

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================
-- Tags (55)
-- ============================================================
INSERT INTO tags (id, name, description) VALUES
  (1,  'javascript',           'ECMAScript and its dialects. Note: NOT Java.'),
  (2,  'python',               'A widely used, dynamically typed programming language.'),
  (3,  'java',                 'A statically typed, object-oriented JVM language.'),
  (4,  'csharp',               'C# and the .NET platform.'),
  (5,  'cpp',                  'C++ and modern C++ idioms.'),
  (6,  'c',                    'The C programming language.'),
  (7,  'rust',                 'Systems language focused on safety, speed, and concurrency.'),
  (8,  'go',                   'Golang — statically typed, compiled, garbage-collected.'),
  (9,  'ruby',                 'Ruby, Rails, and the surrounding ecosystem.'),
  (10, 'php',                  'PHP and modern PHP frameworks.'),
  (11, 'typescript',           'Typed superset of JavaScript.'),
  (12, 'reactjs',              'React library for building user interfaces.'),
  (13, 'vuejs',                'The Vue.js progressive JavaScript framework.'),
  (14, 'angular',              'The Angular framework.'),
  (15, 'nodejs',               'Server-side JavaScript with Node.js.'),
  (16, 'django',               'The Django web framework for Python.'),
  (17, 'flask',                'The Flask micro-framework for Python.'),
  (18, 'fastapi',              'Modern, fast Python web framework.'),
  (19, 'postgresql',           'PostgreSQL object-relational database.'),
  (20, 'mysql',                'MySQL relational database.'),
  (21, 'mongodb',              'MongoDB document database.'),
  (22, 'redis',                'Redis in-memory data structure store.'),
  (23, 'elasticsearch',        'Elasticsearch search and analytics engine.'),
  (24, 'linux',                'Linux operating system and tooling.'),
  (25, 'git',                  'Git version control.'),
  (26, 'github',               'GitHub platform.'),
  (27, 'gitlab',               'GitLab platform.'),
  (28, 'ci-cd',                'Continuous integration and continuous delivery.'),
  (29, 'testing',              'Software testing in general.'),
  (30, 'unit-testing',         'Unit tests and test doubles.'),
  (31, 'integration-testing',  'Integration tests and end-to-end suites.'),
  (32, 'jest',                 'The Jest JavaScript test runner.'),
  (33, 'pytest',               'The pytest Python test framework.'),
  (34, 'css',                  'Cascading Style Sheets.'),
  (35, 'html',                 'HyperText Markup Language.'),
  (36, 'tailwindcss',          'Tailwind CSS utility-first framework.'),
  (37, 'webpack',              'Webpack bundler.'),
  (38, 'vite',                 'Vite frontend build tool.'),
  (39, 'rest',                 'REST architectural style.'),
  (40, 'graphql',              'GraphQL query language and runtime.'),
  (41, 'websockets',           'WebSocket protocol and tooling.'),
  (42, 'microservices',        'Distributed systems built from independently deployable services.'),
  (43, 'monorepo',             'Single repository containing multiple projects.'),
  (44, 'devops',               'DevOps practices and tooling.'),
  (45, 'productivity',         'Tools, habits, and workflows that improve day-to-day output.'),
  (46, 'career',               'Professional growth, job hunting, and workplace practice.'),
  (47, 'wellbeing',            'Mental and physical health at work.'),
  (48, 'security',             'Security engineering and secure coding.'),
  (49, 'performance',          'Measuring and improving performance.'),
  (50, 'docker',               'Docker containers and orchestration.'),
  (51, 'kubernetes',           'Kubernetes container orchestration.'),
  (52, 'aws',                  'Amazon Web Services.'),
  (53, 'gcp',                  'Google Cloud Platform.'),
  (54, 'open-source',          'Open-source software and community work.'),
  (55, 'code-review',          'Peer review of source code changes.');

SELECT setval('tags_id_seq', (SELECT MAX(id) FROM tags));

-- ============================================================
-- Posts — questions (1-26)
-- ============================================================
INSERT INTO posts (id, post_type, title, body, author_id, view_count, created_at) VALUES
  (1,  'question', 'Why does React re-render my component twice inside StrictMode?',                        'I have a small counter component and every time I click the button the `console.log` inside the render body fires twice. I understand StrictMode double-invokes render in development — but my `useEffect` also fires twice.', 6,  48,    NOW() - INTERVAL '2 days'),
  (2,  'question', 'Efficient keyset pagination over a 10M-row Postgres table with a composite index',      'I am paginating a large audit table and OFFSET is killing us once the page number gets high. I have a composite index on (tenant_id, created_at) and want to switch to a keyset approach.', 2,  1204,  NOW() - INTERVAL '2 days 1 hour'),
  (3,  'question', 'TypeScript: narrowing a discriminated union inside an Array.filter callback',           'I have `type Shape = Circle | Square` and I want `shapes.filter(s => s.kind === "circle")` to come back typed as `Circle[]`. It widens back to `Shape[]` unless I hand-write a type predicate.', 5,  73,    NOW() - INTERVAL '2 days 2 hours'),
  (4,  'question', 'Rust borrow checker rejects returning a reference out of a HashMap',                    'I am returning a &String from a function that builds a HashMap inside its body. The borrow checker rejects it with E0515: cannot return reference to local variable.', 4,  9412,  NOW() - INTERVAL '2 days 3 hours'),
  (5,  'question', 'Docker build fails with "no space left on device" on GitHub Actions runners',           'Multi-stage build with a heavy node_modules layer. Works locally but the hosted runner runs out of disk during the export step.', 8,  612,   NOW() - INTERVAL '2 days 4 hours'),
  (6,  'question', 'CSS container queries never match when the component is reused in a sidebar',            'I want a card grid that reflows based on the width of its container rather than the viewport, because the same component is used inside a narrow sidebar and a full-width page.', 9,  156,   NOW() - INTERVAL '2 days 5 hours'),
  (7,  'question', 'Postgres VACUUM FULL on a 500GB table — how do I avoid a six-hour exclusive lock?',      'We have a heavily bloated 500GB table and VACUUM FULL is holding the exclusive lock for way too long. Is there a safer online approach? I have looked at pg_repack.', 2,  843,   NOW() - INTERVAL '2 days 6 hours'),
  (8,  'question', 'How do I profile a Go service with pprof in production without pausing it?',            'We run a Go service under continuous load and I need CPU profiles from production. Restarting is not an option. Is `net/http/pprof` safe to leave running behind auth?', 7,  187,   NOW() - INTERVAL '2 days 7 hours'),
  (9,  'question', 'What is the right way to version a REST API that has mobile clients you cannot force-update?', 'We have an iOS and Android app in the wild that we cannot force-update. I am weighing URL versioning (/v1/, /v2/) against header versioning. What has actually worked for you in production?', 7,  96,    NOW() - INTERVAL '2 days 8 hours'),
  (10, 'question', 'Why does Docker Compose ignore my .env file inside a subdirectory?',                    'I have a Compose file at services/api/docker-compose.yml and a .env next to it. When I run `docker compose up` from the project root, the variables resolve to empty strings.', 3,  42,    NOW() - INTERVAL '1 day'),
  (11, 'question', 'Is it safe to run `git gc --aggressive` on a shared bare repository?',                  'We have a shared bare repo on an NFS mount that a dozen devs push to daily. It has grown to about 4 GB of loose objects. Does `git gc --aggressive` take any locks that would block pushes?', 3,  118,   NOW() - INTERVAL '1 day 2 hours'),
  (12, 'question', 'Why is my FastAPI endpoint slow under load?',                                           'A single async endpoint, 100 concurrent clients via wrk, and p99 latency blows up. Locally with curl it responds in 3ms. What am I missing?', 12, 320,   NOW() - INTERVAL '1 day 4 hours'),
  (13, 'question', 'Best way to handle database migrations in Django',                                       'We are three people on the same project and migration conflicts are constant. Are we supposed to use a different workflow?', 13, 512,   NOW() - INTERVAL '1 day 6 hours'),
  (14, 'question', 'Vue 3 reactivity lost after destructuring',                                              'Reactive state stops updating when I destructure it out of the reactive object. Why? Is there a way to keep reactivity when using object destructuring?', 14, 88,    NOW() - INTERVAL '1 day 8 hours'),
  (15, 'question', 'How to test async code with pytest?',                                                    'I have an async function that uses httpx.AsyncClient. Running pytest warns about event loops. What is the correct setup?', 16, 245,   NOW() - INTERVAL '1 day 10 hours'),
  (16, 'question', 'Jest mock returns undefined for default export',                                         'I am mocking a module that has a default export, but the mock returns undefined. `jest.mock("./module")` with a factory still doesn''t work.', 17, 66,    NOW() - INTERVAL '1 day 12 hours'),
  (17, 'question', 'Kubernetes pods stuck in CrashLoopBackOff after config update',                          'Rolled a ConfigMap change and now three pods are cycling. The logs are empty. What is the fastest way to diagnose?', 18, 1893,  NOW() - INTERVAL '1 day 14 hours'),
  (18, 'question', 'Training a small transformer from scratch — what learning rate schedule?',               'I am training a 10M-parameter transformer on a small English corpus. Linear warmup then cosine decay is what everyone uses, but the warmup length varies. Any guidance?', 19, 542,   NOW() - INTERVAL '1 day 16 hours'),
  (19, 'question', 'MongoDB aggregation pipeline runs out of memory on 2M docs',                             'My pipeline has two $group stages and a $sort. `allowDiskUse: true` helps but the pipeline is now absurdly slow. Better approach?', 20, 134,   NOW() - INTERVAL '1 day 18 hours'),
  (20, 'question', 'WebSockets vs Server-Sent Events for notifications',                                     'We need a one-way feed of notifications to every browser tab. Is WebSockets overkill, or does SSE have hidden gotchas?', 21, 762,   NOW() - INTERVAL '1 day 20 hours'),
  (21, 'question', 'React Native: image upload to S3 stalls on slow networks',                               'Uploading from a React Native app via pre-signed URLs. Small images work fine, but anything over 2 MB stalls above 60% on 3G.', 22, 478,   NOW() - INTERVAL '22 hours'),
  (22, 'question', 'Git rebase vs merge for feature branches — how do teams actually decide?',               'Our team keeps fighting about this. Looking for a principled rule, not a personal preference.', 23, 654,   NOW() - INTERVAL '20 hours'),
  (23, 'question', 'Tailwind CSS: overriding default colors without touching the config',                    'Is there a way to override a single Tailwind class in a scoped component without editing tailwind.config.js?', 24, 312,   NOW() - INTERVAL '18 hours'),
  (24, 'question', 'AWS Lambda cold start optimization — where do I start?',                                 'A Node.js Lambda behind API Gateway occasionally takes 1.8 s on first request. Bottleneck is currently unclear. Which optimizations pay off first?', 18, 1024,  NOW() - INTERVAL '16 hours'),
  (25, 'question', 'GraphQL: solving the N+1 problem without DataLoader',                                    'I want to avoid adding DataLoader to our stack. Are there patterns in the resolver design itself that avoid the N+1 query explosion?', 21, 187,   NOW() - INTERVAL '14 hours'),
  (26, 'question', 'Redis: when to use sets vs sorted sets',                                                 'Both seem to fit leaderboard-style data. What is the real difference in memory and access pattern, and when does one clearly win?', 20, 234,   NOW() - INTERVAL '12 hours');

-- ============================================================
-- Posts — discussions (27-52)
-- ============================================================
INSERT INTO posts (id, post_type, title, body, author_id, view_count, created_at) VALUES
  (27, 'discussion', 'What is your preferred way to handle environment secrets in local dev?',              'I have tried .env, direnv, 1Password CLI, and just exporting things in my shell config. Curious what everyone lands on as a daily driver — especially when juggling five projects at once.', 2,  412,   NOW() - INTERVAL '2 days'),
  (28, 'discussion', 'Unpopular opinion: most code reviews are performative theatre',                        'Reviewers rubber-stamp huge diffs, then bikeshed variable names on a five-line PR. Is this really the best we can do?', 6,  1893,  NOW() - INTERVAL '2 days 1 hour'),
  (29, 'discussion', 'When do you actually reach for a monorepo?',                                           'Debating whether to merge three repos at work. What is the actual threshold — team size, shared types, deploy cadence? Or is it more about org structure than tech?', 4,  640,   NOW() - INTERVAL '2 days 2 hours'),
  (30, 'discussion', 'How do you stay productive during the 3pm slump?',                                     'Coffee stopped working. Naps are great but not always possible. Looking for realistic habits that do not involve "just take a walk" every time.', 9,  208,   NOW() - INTERVAL '2 days 3 hours'),
  (31, 'discussion', 'Is Rust''s learning curve really as bad as people say?',                              'I am comfortable with Go and TypeScript. Every time I try Rust the borrow checker humbles me in the first hour. Does it get better, or do you just build a mental model?', 5,  1204,  NOW() - INTERVAL '2 days 4 hours'),
  (32, 'discussion', 'Conference talks: slides or live coding?',                                             'I am submitting a talk for the first time. Half the advice I read says never live-code, the other half says slides are boring. What actually works in practice?', 8,  96,    NOW() - INTERVAL '2 days 5 hours'),
  (33, 'discussion', 'Is it worth learning a second database engine, or should you go deep on one?',        'I have been Postgres-only for eight years. Every time I think about picking up MongoDB or ClickHouse, I wonder if I am better off deepening my Postgres game.', 2,  218,   NOW() - INTERVAL '2 days 6 hours'),
  (34, 'discussion', 'Do you write tests for personal projects, or only for work code?',                     'Religious about tests at work. The moment I open a side project on a Saturday, I ship and pray. Healthy boundary or bad habit?', 7,  134,   NOW() - INTERVAL '2 days 7 hours'),
  (35, 'discussion', 'Is "microservices" just the default answer to every scaling question now?',           'Every time someone asks "how do I scale X?" the top answer is inevitably split it into microservices. When does that actually apply?', 7,  71,    NOW() - INTERVAL '2 days 8 hours'),
  (36, 'discussion', 'Should we standardize on TypeScript at work?',                                         'We are 60 percent TypeScript, 40 percent JavaScript. Migrating the rest is a quarter of work. Is the payoff real, or are we paying for theory?', 17, 189,   NOW() - INTERVAL '1 day'),
  (37, 'discussion', 'Is TDD still relevant in 2026?',                                                       'Most teams I know write tests after. A few preach strict TDD. Which camp is actually shipping faster today?', 14, 245,   NOW() - INTERVAL '1 day 2 hours'),
  (38, 'discussion', 'Vim vs Neovim vs Helix vs VS Code',                                                    'I have used VS Code for years and want to try something different. Neovim with a full LSP config is appealing, but Helix sounds friendlier. What is your daily driver in 2026?', 23, 512,   NOW() - INTERVAL '1 day 4 hours'),
  (39, 'discussion', 'How do you document side projects?',                                                   'READMEs go stale. Wikis rot. I am curious what actually works for solo developers who want future-them to understand past-them.', 13, 320,   NOW() - INTERVAL '1 day 6 hours'),
  (40, 'discussion', 'Is serverless really cheaper for small projects?',                                     'Every serverless pitch promises pay-per-use. But the observability story alone seems to cost more than a small VPS. Am I missing something?', 18, 189,   NOW() - INTERVAL '1 day 8 hours'),
  (41, 'discussion', 'What is the best way to onboard a junior dev?',                                       'We have a new junior joining Monday. I want them shipping on day one without breaking prod. What has worked in your teams?', 12, 432,   NOW() - INTERVAL '1 day 10 hours'),
  (42, 'discussion', 'Is remote work here to stay?',                                                         'Three years post-pandemic, some companies are still fully remote, others have called everyone back. What is actually happening on the ground?', 22, 876,   NOW() - INTERVAL '1 day 12 hours'),
  (43, 'discussion', 'Should AI assistants be allowed in code reviews?',                                     'A teammate has started using a commercial AI assistant to suggest review comments. Some find it helpful, others find it lazy. Where is the line?', 19, 234,   NOW() - INTERVAL '1 day 14 hours'),
  (44, 'discussion', 'Frontend framework fatigue — how do you pick what to learn next?',                     'React, Vue, Svelte, Solid, Qwik, HTMX... every year a new default. How do you decide which one is worth investing hours in?', 24, 654,   NOW() - INTERVAL '1 day 16 hours'),
  (45, 'discussion', 'What is the right abstraction level for a REST API?',                                 'Some APIs expose every database table. Others give three endpoints. Both have horror stories. Is there a middle ground that actually holds up?', 21, 321,   NOW() - INTERVAL '1 day 18 hours'),
  (46, 'discussion', 'Are certifications worth the money?',                                                 'Cloud certs, security certs, Kubernetes certs. Do hiring managers actually care, or are they a tax on the anxious?', 15, 178,   NOW() - INTERVAL '22 hours'),
  (47, 'discussion', 'Linux distro for development in 2026',                                                 'Considering a switch from macOS to Linux for day-to-day dev. Which distro gives the best balance of stability and package freshness?', 23, 245,   NOW() - INTERVAL '20 hours'),
  (48, 'discussion', 'How to convince management to invest in testing',                                      'Leadership sees testing as overhead. We see it as insurance. What arguments have actually moved the needle for you?', 14, 189,   NOW() - INTERVAL '18 hours'),
  (49, 'discussion', 'Microservices vs modular monolith — where is the pendulum now?',                       'Five years ago microservices were the default. Now I hear a lot of "modular monolith" talk. Is this a genuine correction, or just the next hype cycle?', 13, 432,   NOW() - INTERVAL '16 hours'),
  (50, 'discussion', 'Is GraphQL still worth adopting in 2026?',                                             'Many teams have moved back to REST or tRPC. Was GraphQL a specific-tool-for-a-specific-problem all along?', 17, 567,   NOW() - INTERVAL '14 hours'),
  (51, 'discussion', 'What would you study if you started programming today?',                              'Given today''s landscape — AI assistants, mature frameworks, abundant tutorials — where would you focus first?', 24, 789,   NOW() - INTERVAL '12 hours'),
  (52, 'discussion', 'How do you handle burnout?',                                                           'Not asking for myself (well, maybe a little). What actually works for you when the work stops being fun?', 5,  234,   NOW() - INTERVAL '10 hours');

SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts));

-- ============================================================
-- Post ↔ tag mappings
-- ============================================================
INSERT INTO post_tags (post_id, tag_id) VALUES
  (1, 1),  (1, 12),
  (2, 19), (2, 49),
  (3, 11),
  (4, 7),
  (5, 50), (5, 28), (5, 26),
  (6, 34),
  (7, 19), (7, 49),
  (8, 8),  (8, 49),
  (9, 39), (9, 49),
  (10, 50),
  (11, 25),
  (12, 18), (12, 2), (12, 49),
  (13, 16), (13, 2),
  (14, 13),
  (15, 33), (15, 2),
  (16, 32), (16, 1),
  (17, 51), (17, 44),
  (18, 2),
  (19, 21), (19, 49),
  (20, 41), (20, 39),
  (21, 12), (21, 52),
  (22, 25), (22, 55),
  (23, 34), (23, 36),
  (24, 52), (24, 49),
  (25, 40), (25, 49),
  (26, 22), (26, 49),
  (27, 44), (27, 48),
  (28, 44), (28, 55), (28, 46),
  (29, 43), (29, 42),
  (30, 45), (30, 47),
  (31, 7),  (31, 46),
  (32, 46),
  (33, 19), (33, 46),
  (34, 29), (34, 45),
  (35, 42), (35, 46),
  (36, 11),
  (37, 29),
  (38, 24), (38, 45),
  (39, 54),
  (40, 53), (40, 49),
  (41, 46),
  (42, 47), (42, 46),
  (43, 48),
  (44, 34), (44, 46),
  (45, 39), (45, 42),
  (46, 48), (46, 46),
  (47, 24), (47, 45),
  (48, 29), (48, 46),
  (49, 42),
  (50, 40), (50, 39),
  (51, 46), (51, 45),
  (52, 47), (52, 46);

-- ============================================================
-- Answers (35, across 20 of the 26 questions)
-- ============================================================
INSERT INTO answers (id, post_id, author_id, body, created_at) VALUES
  (1,  1,  5, 'This is intentional. StrictMode double-invokes two things in development: render, and effect setup plus cleanup. Use an AbortController in the cleanup so the first request is aborted when React unmounts. The second run is what actually resolves.', NOW() - INTERVAL '1 day 20 hours'),
  (2,  1,  4, 'Development-only behaviour. Production builds run the effect once. If you truly need to suppress the second run, a ref guard works, but the AbortController fix is cleaner.', NOW() - INTERVAL '1 day 18 hours'),
  (3,  2,  5, 'Add the primary key to the ORDER BY as a tie-breaker, then use a row-value comparison: WHERE (tenant_id, created_at, id) > ($1, $2, $3) ORDER BY tenant_id, created_at, id LIMIT $4.', NOW() - INTERVAL '1 day 22 hours'),
  (4,  2,  6, 'Row-value comparison is the correct approach. Just be careful with the composite index — Postgres needs to see all three columns in the index to use it efficiently.', NOW() - INTERVAL '1 day 20 hours'),
  (5,  2,  8, 'Run EXPLAIN (ANALYZE, BUFFERS) on both queries before deciding. I have seen keyset pagination lose to OFFSET on small pages because of index choice.', NOW() - INTERVAL '1 day 18 hours'),
  (6,  3,  11, 'TypeScript cannot narrow through Array.filter without help. The idiomatic fix is a type predicate: function isCircle(s: Shape): s is Circle { return s.kind === "circle"; }', NOW() - INTERVAL '2 days 1 hour'),
  (7,  4,  4, 'Return owned data. The HashMap is dropped at the end of the function, so any reference to it is invalid. Either return the String by value, or make the map live longer than the caller.', NOW() - INTERVAL '1 day 22 hours'),
  (8,  4,  6, 'OnceLock or a lazy static will work if the map is truly global. Otherwise just clone — the allocation is cheap next to the compile-time friction.', NOW() - INTERVAL '1 day 20 hours'),
  (9,  5,  4, 'Use the registry cache backend for BuildKit: docker buildx create --driver docker-container --use with --cache-to type=registry.', NOW() - INTERVAL '1 day 22 hours'),
  (10, 7,  4, 'pg_repack is the standard answer. It rebuilds the table under a trigger-based shadow copy while writes continue. Schedule during low traffic and watch WAL usage.', NOW() - INTERVAL '1 day 22 hours'),
  (11, 7,  6, 'Alternative: partition the table by created_at, then drop and rebuild old partitions. Does not help for hot data but is great for archival.', NOW() - INTERVAL '1 day 20 hours'),
  (12, 8,  4, 'net/http/pprof is fine in production if you bind it to a separate internal port and gate it with your usual auth. The endpoints only cost CPU while a profile is being taken.', NOW() - INTERVAL '1 day 22 hours'),
  (13, 8,  2, 'Also consider runtime/trace for latency. pprof tells you where CPU time goes; trace tells you where wall-clock time goes, which is often the real answer.', NOW() - INTERVAL '1 day 20 hours'),
  (14, 10, 2, 'Compose reads .env from the current working directory, not from the compose file location. Either cd in first, or pass --env-file services/api/.env.', NOW() - INTERVAL '20 hours'),
  (15, 12, 4, 'If your handler is async but the database call is blocking, you are stalling the event loop. Use an async driver or run the blocking call in a thread pool via run_in_threadpool.', NOW() - INTERVAL '1 day 20 hours'),
  (16, 12, 6, 'Check whether httpx is reusing a connection pool. Creating a new client per request will hit p99 latency hard.', NOW() - INTERVAL '1 day 18 hours'),
  (17, 12, 2, 'Also verify that uvicorn is running with the correct --workers setting and that you are not CPU-bound on the reverse proxy.', NOW() - INTERVAL '1 day 16 hours'),
  (18, 13, 4, 'Use a linear integration branch, one migration per PR, and merge main into your branch before creating a migration. Never edit a migration that has already been applied.', NOW() - INTERVAL '1 day 20 hours'),
  (19, 14, 12, 'Destructuring a reactive object extracts the plain value, losing the proxy. Use toRefs() to get refs, or access properties through the reactive object itself.', NOW() - INTERVAL '1 day 20 hours'),
  (20, 15, 5, 'Install pytest-asyncio and mark your tests with @pytest.mark.asyncio. The event-loop warning is a sign your async function was being called synchronously.', NOW() - INTERVAL '1 day 20 hours'),
  (21, 15, 2, 'You will also want asyncio_mode = auto in your pytest config so you do not need to mark every test.', NOW() - INTERVAL '1 day 18 hours'),
  (22, 16, 4, 'jest.mock must be called before importing the module, and the factory must return an object with a default property. If your module is ESM, use jest.unstable_mockModule.', NOW() - INTERVAL '1 day 20 hours'),
  (23, 17, 4, 'kubectl describe pod <name> will show the last container status. If it is OOMKilled, bump the limit. If it is a config error, kubectl logs --previous shows the previous run.', NOW() - INTERVAL '1 day 20 hours'),
  (24, 17, 8, 'Also check that the ConfigMap actually rolled. If the Deployment is not using the checksum annotation, it will not restart pods on ConfigMap change.', NOW() - INTERVAL '1 day 18 hours'),
  (25, 18, 4, 'Warmup length matters less than peak learning rate. Try 5% warmup with peak 3e-4 and cosine to 1e-5; adjust from there.', NOW() - INTERVAL '1 day 20 hours'),
  (26, 20, 4, 'WebSockets are overkill for one-way notifications. SSE is simpler, works over plain HTTP/2, reconnects automatically, and does not need a separate upgrade path.', NOW() - INTERVAL '1 day 20 hours'),
  (27, 20, 6, 'SSE has a 6-connection limit per domain in HTTP/1.1, but that disappears over HTTP/2. If your users are on old browsers, test carefully.', NOW() - INTERVAL '1 day 18 hours'),
  (28, 20, 8, 'Third option: Long polling as a fallback when SSE is not available. Most notification libraries support both out of the box.', NOW() - INTERVAL '1 day 16 hours'),
  (29, 21, 4, 'Chunk the upload. S3 multipart with 5 MB chunks works well on unstable networks because each chunk retries independently.', NOW() - INTERVAL '18 hours'),
  (30, 22, 4, 'Rebase your own branches, merge to main. The rule that works for us: if it is not shared, rebase; if it is shared, merge.', NOW() - INTERVAL '18 hours'),
  (31, 22, 6, 'Agree with the above but add: rebase before opening the PR, never after review has started. That way reviewers see the final diff.', NOW() - INTERVAL '16 hours'),
  (32, 24, 4, 'Bundle and minify first; cold start is dominated by module load. Then move to provisioned concurrency for the critical routes only.', NOW() - INTERVAL '14 hours'),
  (33, 24, 8, 'If the Lambda is behind API Gateway, enable API Gateway caching for the read-heavy routes. That often removes the need for provisioned concurrency entirely.', NOW() - INTERVAL '12 hours'),
  (34, 24, 2, 'SnapStart is worth trying if you can tolerate its limitations on supported runtimes and layer usage.', NOW() - INTERVAL '10 hours'),
  (35, 25, 4, 'Without DataLoader, restructure the resolvers to batch by the parent query. The field resolver receives the parent row, so you can collect all parents and resolve the children in one query per parent set.', NOW() - INTERVAL '12 hours');

SELECT setval('answers_id_seq', (SELECT MAX(id) FROM answers));

-- ============================================================
-- Mark accepted answers (10 questions)
-- ============================================================
UPDATE answers SET is_accepted = TRUE WHERE id IN (1, 3, 7, 10, 15, 18, 20, 23, 30, 32);
UPDATE posts SET accepted_answer_id = CASE id
    WHEN 1  THEN 1
    WHEN 2  THEN 3
    WHEN 4  THEN 7
    WHEN 7  THEN 10
    WHEN 12 THEN 15
    WHEN 13 THEN 18
    WHEN 15 THEN 20
    WHEN 17 THEN 23
    WHEN 22 THEN 30
    WHEN 24 THEN 32
  END
WHERE id IN (1, 2, 4, 7, 12, 13, 15, 17, 22, 24);

-- ============================================================
-- Comments — level 1 (question comments, answer comments, top-level discussion replies)
-- ============================================================

-- 30 question comments (flat)
INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES
  (1,  1,  4,  'This is by design. StrictMode intentionally mounts, unmounts, and remounts in development so you can catch missing cleanup.', NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'),
  (2,  1,  5,  'Worth mentioning this only happens in development builds.', NOW() - INTERVAL '2 days' + INTERVAL '15 minutes'),
  (3,  1,  8,  'The AbortController answer below is the right one.', NOW() - INTERVAL '2 days' + INTERVAL '2 hours'),
  (4,  2,  6,  'Row-value comparison is the answer I expected to see. It works in Postgres 9.5 and up.', NOW() - INTERVAL '2 days' + INTERVAL '3 hours'),
  (5,  2,  9,  'Would love to see the EXPLAIN output if you get a chance.', NOW() - INTERVAL '2 days' + INTERVAL '4 hours'),
  (6,  4,  4,  'This error is the borrow checker doing its job. It is annoying but it is right.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (7,  4,  5,  'Return owned data has never once let me down for a first fix.', NOW() - INTERVAL '2 days' + INTERVAL '3 hours'),
  (8,  5,  6,  'The GitHub Actions cache is another lever — cache the Docker build layers between runs.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (9,  7,  8,  'pg_repack is also what I would reach for. Watch the trigger overhead on high-write tables.', NOW() - INTERVAL '2 days' + INTERVAL '2 hours'),
  (10, 7,  2,  'Worth checking pg_stat_activity before starting — a rogue long-running query will block pg_repack too.', NOW() - INTERVAL '2 days' + INTERVAL '5 hours'),
  (11, 8,  6,  'Bind pprof to 127.0.0.1 only, and gate it behind a token. Overkill is better than exposed.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (12, 8,  9,  'runtime/trace is underrated. Half my latency investigations end there.', NOW() - INTERVAL '2 days' + INTERVAL '3 hours'),
  (13, 10, 5,  'This one bit me too. Pass --env-file and everything resolves.', NOW() - INTERVAL '20 hours' + INTERVAL '10 minutes'),
  (14, 12, 6,  'The blocking call in an async endpoint is almost certainly your problem. We hit this exact thing.', NOW() - INTERVAL '1 day' + INTERVAL '3 hours'),
  (15, 12, 8,  'Also check the connection pool size. With 100 concurrent clients, a pool of 5 will starve.', NOW() - INTERVAL '1 day' + INTERVAL '5 hours'),
  (16, 13, 2,  'The migration conflict pain is real. Agree with the linear branch advice above.', NOW() - INTERVAL '1 day' + INTERVAL '4 hours'),
  (17, 14, 5,  'toRefs is the correct answer. Took me months to find this the first time.', NOW() - INTERVAL '1 day' + INTERVAL '4 hours'),
  (18, 15, 4,  'pytest-asyncio plus asyncio_mode = auto makes async tests feel normal.', NOW() - INTERVAL '1 day' + INTERVAL '4 hours'),
  (19, 17, 6,  'kubectl describe plus kubectl logs --previous is my go-to combination.', NOW() - INTERVAL '1 day' + INTERVAL '4 hours'),
  (20, 17, 9,  'Also check the pod events — frequently the real cause is image pull or scheduling, not the app.', NOW() - INTERVAL '1 day' + INTERVAL '8 hours'),
  (21, 20, 8,  'SSE for us. We tried WebSockets and the reconnection story was miserable.', NOW() - INTERVAL '1 day' + INTERVAL '5 hours'),
  (22, 21, 6,  'Multipart upload is the fix. Anything over 1 MB and you want resumability.', NOW() - INTERVAL '18 hours' + INTERVAL '30 minutes'),
  (23, 22, 8,  'The rule I use with new hires: rebase until someone else might have pulled, then merge.', NOW() - INTERVAL '18 hours' + INTERVAL '2 hours'),
  (24, 24, 6,  'SnapStart has been a game changer for us on Java. Not sure about Node.', NOW() - INTERVAL '14 hours' + INTERVAL '3 hours'),
  (25, 24, 8,  'API Gateway caching alone saved us 40 percent on cold-start latency.', NOW() - INTERVAL '13 hours' + INTERVAL '30 minutes'),
  (26, 25, 5,  'The batching-by-parent trick works surprisingly well when your parent query is already limited.', NOW() - INTERVAL '12 hours' + INTERVAL '1 hour'),
  (27, 26, 4,  'Sorted sets when you need ordering, sets when you need membership. Memory cost favours sets.', NOW() - INTERVAL '10 hours' + INTERVAL '2 hours'),
  (28, 26, 8,  'A common pattern: sorted set for the leaderboard, plain set for the "who has played" membership check.', NOW() - INTERVAL '10 hours' + INTERVAL '4 hours'),
  (29, 9,  6,  'URL versioning for us. Easier to reason about, easier to cache, easier to deprecate.', NOW() - INTERVAL '2 days' + INTERVAL '4 hours'),
  (30, 9,  9,  'Header versioning is elegant but every mobile dev I know has broken it by forgetfulness.', NOW() - INTERVAL '2 days' + INTERVAL '6 hours');

-- 25 answer comments (flat)
INSERT INTO comments (id, answer_id, author_id, body, created_at) VALUES
  (31, 1,  6,  'The AbortController part is the bit most people miss. Thanks for spelling it out.', NOW() - INTERVAL '1 day 19 hours'),
  (32, 1,  2,  'Bookmarked. Sending this to my whole team.', NOW() - INTERVAL '1 day 18 hours'),
  (33, 2,  9,  'A ref guard feels wrong for the same reason. It hides the symptom.', NOW() - INTERVAL '1 day 16 hours'),
  (34, 3,  8,  'Row-value comparison is underused. Wrote a blog post about this last year.', NOW() - INTERVAL '1 day 21 hours'),
  (35, 4,  2,  'The composite index point is critical — without it the row-value comparison is slower than OFFSET.', NOW() - INTERVAL '1 day 19 hours'),
  (36, 6,  4,  'Type predicates are TypeScript''s way of saying "trust me" without losing safety.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (37, 7,  5,  'OnceLock is elegant but the initialization can surprise you the first time.', NOW() - INTERVAL '1 day 19 hours'),
  (38, 9,  8,  'Registry cache is the answer. Also worth setting compression on the cache export.', NOW() - INTERVAL '1 day 20 hours'),
  (39, 10, 6,  'pg_repack saved us a maintenance window last quarter. Heartily agree.', NOW() - INTERVAL '1 day 20 hours'),
  (40, 12, 9,  'The separate internal port is the part I always forget.', NOW() - INTERVAL '1 day 20 hours'),
  (41, 14, 3,  'The --env-file flag is poorly documented for how useful it is.', NOW() - INTERVAL '18 hours'),
  (42, 15, 6,  'run_in_threadpool is the FastAPI primitive most people skip over.', NOW() - INTERVAL '1 day 18 hours'),
  (43, 16, 8,  'httpx.AsyncClient() per request is a massive performance sink. Reuse it.', NOW() - INTERVAL '1 day 16 hours'),
  (44, 18, 6,  'Never editing an applied migration is the single most important Django rule.', NOW() - INTERVAL '1 day 18 hours'),
  (45, 19, 9,  'toRefs saved me when we moved to the Composition API.', NOW() - INTERVAL '1 day 18 hours'),
  (46, 20, 2,  'pytest-asyncio is the right answer. The event-loop warning disappears once configured.', NOW() - INTERVAL '1 day 18 hours'),
  (47, 22, 9,  'jest.unstable_mockModule is required for ESM. Took me a full day to figure out.', NOW() - INTERVAL '1 day 18 hours'),
  (48, 23, 5,  'kubectl logs --previous is the flag that unlocks most CrashLoopBackOff diagnosis.', NOW() - INTERVAL '1 day 18 hours'),
  (49, 26, 2,  'SSE is underrated. We use it for everything one-way now.', NOW() - INTERVAL '1 day 18 hours'),
  (50, 30, 6,  'The rebase-then-merge rule is what I try to teach juniors. Great phrasing.', NOW() - INTERVAL '16 hours'),
  (51, 32, 9,  'Bundling first before touching provisioned concurrency — yes. Too many people skip that.', NOW() - INTERVAL '12 hours'),
  (52, 32, 5,  'Also worth checking whether the Node runtime version actually supports SnapStart yet.', NOW() - INTERVAL '11 hours'),
  (53, 35, 8,  'Restructuring the resolver is the right approach when DataLoader is off the table.', NOW() - INTERVAL '10 hours'),
  (54, 27, 5,  'Sorted set for leaderboard, plain set for membership — this is the canonical pattern.', NOW() - INTERVAL '10 hours'),
  (55, 28, 4,  'The two-key pattern also lets you expire the leaderboard independently of membership.', NOW() - INTERVAL '10 hours');

-- 25 top-level discussion replies
INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES
  (56, 27, 4,  'direnv plus 1Password CLI is the combo that finally stuck for me. Each project gets a .envrc with `op run --env-file` and secrets never hit disk.', NOW() - INTERVAL '2 days' + INTERVAL '6 minutes'),
  (57, 27, 6,  'Seconded. The `op run` wrapper is the killer feature — you get the secret injected into the subprocess only.', NOW() - INTERVAL '2 days' + INTERVAL '15 minutes'),
  (58, 27, 8,  'Does that work with VSCode''s debugger? I remember hitting friction there.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (59, 27, 9,  'I just use a gitignored secrets.local.json plus a make target. Zero tooling, works everywhere.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (60, 27, 2,  'The concern with a plaintext file is collaborators accidentally copying production values into it. A README warning is fragile.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (61, 28, 4,  'I have felt this. The signal-to-noise ratio on most reviews is terrible.', NOW() - INTERVAL '2 days' + INTERVAL '6 minutes'),
  (62, 28, 8,  'Some of it is tooling. If the diff is small by design, reviewers actually read it.', NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  (63, 28, 2,  'Or the review is performative because management treats it as a checkbox.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (64, 28, 9,  'I run a "review the reviews" retro every quarter and it has measurably improved our process.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (65, 28, 5,  'Small PRs fix most of this. Five hundred lines is impossible to review well.', NOW() - INTERVAL '2 days' + INTERVAL '2 hours'),
  (66, 29, 5,  'We moved to a monorepo at around 6 teams. Below that it was not worth the tooling.', NOW() - INTERVAL '2 days' + INTERVAL '15 minutes'),
  (67, 29, 8,  'Shared types are the killer feature. If you have zero shared types, a polyrepo is fine.', NOW() - INTERVAL '2 days' + INTERVAL '40 minutes'),
  (68, 29, 6,  'Deploy cadence independence matters too. In a monorepo you need path-filtered CI or you are paying for every commit.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (69, 30, 4,  'Walk before lunch, not after. The 3pm slump usually starts at 2.', NOW() - INTERVAL '2 days' + INTERVAL '10 minutes'),
  (70, 30, 6,  'I switch to low-cognitive-load work around 3. Reviews, cleanup, inbox. Save the hard problems for mornings.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (71, 30, 9,  'Small thing but: water. Most of us are chronically dehydrated by mid-afternoon.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (72, 31, 8,  'It gets better. The borrow checker is teaching you, not fighting you.', NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'),
  (73, 31, 4,  'Six months of daily Rust and the borrow checker stopped mattering. The mental model does form.', NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  (74, 31, 5,  'Coming from Go, Rust is a bigger jump than most people admit. Give yourself six months minimum.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (75, 31, 2,  'The "just build a mental model" advice is real, but the mental model takes weeks, not hours.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (76, 32, 9,  'Slides. Live coding always goes wrong, and the audience is not there to watch you debug.', NOW() - INTERVAL '2 days' + INTERVAL '15 minutes'),
  (77, 32, 6,  'Live coding if you rehearse it ten times. Slides otherwise.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (78, 33, 8,  'Breadth is overrated. Depth in one engine translates to deeper understanding of every other.', NOW() - INTERVAL '2 days' + INTERVAL '15 minutes'),
  (79, 33, 5,  'I would learn a document store specifically because the access patterns are so different. Postgres cannot teach you that.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (80, 34, 6,  'Tests in personal projects are for future-you. Write the ones that will save you a day next year, skip the rest.', NOW() - INTERVAL '2 days' + INTERVAL '10 minutes');

-- ============================================================
-- Comments — level 2 (15 replies to discussion top-level replies)
-- ============================================================
INSERT INTO comments (id, post_id, parent_comment_id, author_id, body, created_at) VALUES
  (81,  27, 56, 6,  'The op run wrapper is really the thing that makes this stick.', NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  (82,  27, 57, 8,  'Also works with VSCode if you launch VSCode from inside the direnv shell.', NOW() - INTERVAL '2 days' + INTERVAL '25 minutes'),
  (83,  27, 58, 9,  'Noted. I might finally give direnv another try.', NOW() - INTERVAL '2 days' + INTERVAL '40 minutes'),
  (84,  28, 61, 2,  'The tooling point is underrated. Five-line PRs are impossible to hide behind.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (85,  28, 63, 9,  'Retroing the retro is exactly how we fixed ours.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (86,  29, 66, 8,  'Six teams is a real threshold. Below that I have seen it be net negative.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (87,  30, 69, 6,  'Walk before lunch — saving this.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (88,  31, 72, 5,  'The "it gets better" line is what kept me going in month two.', NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  (89,  31, 73, 2,  'Six months of daily Rust is not a small commitment. Worth flagging for anyone considering.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (90,  31, 74, 8,  'Coming from Go, the ownership model is genuinely a different mental shape.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour 30 minutes'),
  (91,  32, 76, 5,  'Ten rehearsals is the correct number. Nine is not enough.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (92,  33, 78, 6,  'Depth-first is the better long game. Agreed.', NOW() - INTERVAL '2 days' + INTERVAL '40 minutes'),
  (93,  34, 80, 9,  'Write the ones that will save future-you a day — this is the correct threshold.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (94,  28, 62, 5,  'Small diffs are the single biggest lever on review quality.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour 15 minutes'),
  (95,  27, 60, 4,  'The README warning plus code review is fragile. Vault in prod and short-lived local creds is safer.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour 30 minutes');

-- ============================================================
-- Comments — level 3 (10 replies to level-2 comments)
-- ============================================================
INSERT INTO comments (id, post_id, parent_comment_id, author_id, body, created_at) VALUES
  (96,  27, 81, 4,  'The subprocess-only injection is exactly what makes it compelling for security teams.', NOW() - INTERVAL '2 days' + INTERVAL '25 minutes'),
  (97,  27, 82, 9,  'I remember the VSCode friction now. It was the launch-from-shell requirement.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (98,  28, 84, 6,  'Exactly. The diff size is the constraint, and then everything follows.', NOW() - INTERVAL '2 days' + INTERVAL '40 minutes'),
  (99,  29, 86, 5,  'Below four teams it is usually a monorepo tax, not a monorepo win.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (100, 31, 88, 2,  'Month two is when most people quit Rust. The mental model lands in month four or five.', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'),
  (101, 31, 90, 4,  'Go and Rust are solving different problems. Ownership is more of a languages-with-real-control-flow model.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour 15 minutes'),
  (102, 32, 91, 6,  'Nine is enough if you have rehearsed the walking-off-stage-and-back.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (103, 34, 93, 5,  'Also: write the tests that catch the bug you already had once, before the second time.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour'),
  (104, 27, 83, 6,  'Give it a shot. The direnv plus op run combination is low-friction once configured.', NOW() - INTERVAL '2 days' + INTERVAL '45 minutes'),
  (105, 28, 94, 9,  'And yet most teams still merge 500-line PRs. The tooling only does so much.', NOW() - INTERVAL '2 days' + INTERVAL '1 hour 30 minutes');

SELECT setval('comments_id_seq', (SELECT MAX(id) FROM comments));

-- ============================================================
-- Reports (6, covering the main reasons)
-- ============================================================
INSERT INTO reports (reporter_id, target_type, target_id, reason, details, status, resolved_at, resolved_by_user_id, created_at) VALUES
  (6,  'post',    5,  'spam',                'This looks like promotional content for a paid Docker course.', 'pending',   NULL,                            NULL, NOW() - INTERVAL '2 hours'),
  (4,  'post',    12, 'off-topic',           'This is more of a debugging help request than a programming question.', 'pending',   NULL,                            NULL, NOW() - INTERVAL '4 hours'),
  (18, 'answer',  9,  'abuse',               'The tone here is unnecessarily aggressive.', 'pending',   NULL,                            NULL, NOW() - INTERVAL '6 hours'),
  (8,  'comment', 57, 'off-topic-discussion', 'This reply does not address the OP and is just self-promotion.', 'reviewed', NOW() - INTERVAL '1 hour',  1,    NOW() - INTERVAL '1 day'),
  (12, 'post',    8,  'duplicate',           'This is a duplicate of an earlier question about pprof.', 'pending',   NULL,                            NULL, NOW() - INTERVAL '8 hours'),
  (21, 'post',    21, 'plagiarism',          'This is copied verbatim from a blog post without attribution.', 'dismissed', NOW() - INTERVAL '12 hours', 2,    NOW() - INTERVAL '2 days');

-- ============================================================
-- Post marks (5)
-- ============================================================
INSERT INTO post_marks (post_id, mark_type, marked_by_user_id, notes) VALUES
  (5,  'violated',  NULL, 'Auto-detected: potential spam'),
  (12, 'off_topic', 4,    'Marked off-topic by moderator'),
  (8,  'duplicated', 6,    'Duplicate of question 7483001'),
  (21, 'spam',      4,    'User report + auto-classifier flagged'),
  (35, 'violated',  NULL, 'Auto-detected: provocative opinion piece');

-- ============================================================
-- Follows (deterministic pattern)
-- ============================================================
INSERT INTO follows (follower_id, followed_id)
SELECT u1.id, u2.id
FROM users u1
CROSS JOIN users u2
WHERE u1.id < u2.id
  AND (u1.id * 3 + u2.id * 7) % 13 = 0;

-- ============================================================
-- Votes (deterministic, ~200 rows across posts/answers/comments)
-- ============================================================

-- Post votes: ~5% of (user, post) pairs, one vote per pair, ~10% downvotes
INSERT INTO votes (user_id, target_type, target_id, value, created_at)
SELECT
  u.id, 'post', p.id,
  CASE WHEN (u.id * 3 + p.id * 7) % 10 = 0 THEN -1 ELSE 1 END,
  NOW() - INTERVAL '2 days' + ((u.id * 11 + p.id * 5) * INTERVAL '1 minute')
FROM users u
CROSS JOIN posts p
WHERE (u.id + p.id * 3) % 20 = 0
  AND u.id <> p.author_id;

-- Answer votes: ~2% of (user, answer) pairs
INSERT INTO votes (user_id, target_type, target_id, value, created_at)
SELECT
  u.id, 'answer', a.id,
  CASE WHEN (u.id * 5 + a.id * 3) % 12 = 0 THEN -1 ELSE 1 END,
  NOW() - INTERVAL '1 day 12 hours' + ((u.id * 7 + a.id * 11) * INTERVAL '1 minute')
FROM users u
CROSS JOIN answers a
WHERE (u.id * 3 + a.id) % 50 = 0
  AND u.id <> a.author_id;

-- Comment votes: ~1.5% of (user, comment) pairs
INSERT INTO votes (user_id, target_type, target_id, value, created_at)
SELECT
  u.id, 'comment', c.id,
  CASE WHEN (u.id * 7 + c.id * 5) % 8 = 0 THEN -1 ELSE 1 END,
  NOW() - INTERVAL '1 day' + ((u.id * 3 + c.id * 7) * INTERVAL '1 minute')
FROM users u
CROSS JOIN comments c
WHERE (u.id * 5 + c.id * 3) % 67 = 0
  AND u.id <> c.author_id;

-- ============================================================
-- Final sync: make updated_at match created_at for seed content
-- ============================================================
UPDATE posts    SET updated_at = created_at WHERE updated_at > created_at + INTERVAL '1 second';
UPDATE answers  SET updated_at = created_at WHERE updated_at > created_at + INTERVAL '1 second';
UPDATE comments SET updated_at = created_at WHERE updated_at > created_at + INTERVAL '1 second';

COMMIT;