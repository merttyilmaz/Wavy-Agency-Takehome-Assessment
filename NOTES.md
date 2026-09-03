# NOTES

A cut-down clipping marketplace: brands post paid campaigns, creators submit
short-form clips, and creators earn per 1,000 views up to the campaign budget.

**Live:** https://wavy-agency-takehome.vercel.app

There is no login. Pick an identity from the user switcher in the header —
`admin@wavy.test` for the admin side, `alice@creator.test` for the creator
side. The live database is seeded; §9 covers the deployment.

## 1. Setup

Needs Node 20+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env          # works as-is; no secrets to fill in
docker compose up -d          # Postgres 16 on host port 5433
pnpm db:migrate               # applies the committed drizzle-kit migrations
pnpm db:seed                  # 2 admins, 2 creators, 4 campaigns, submissions
pnpm ingest                   # fakes today's metrics sync
pnpm dev                      # http://localhost:3000
```

`pnpm test` on a clean checkout, after `docker compose up -d`:

```bash
pnpm test
```

Notes on the setup:

- Postgres is published on **5433**, not 5432, so it does not collide with a
  Postgres already running on the machine.
- The compose file creates two databases: `wavy` for the app and `wavy_test`
  for the suite (`docker/init-test-db.sql`). The tests migrate `wavy_test`
  themselves in a Vitest `globalSetup`, so `pnpm test` works before you have
  ever run the app.
- `AUTH_SECRET` only signs the dev session cookie. Any non-empty string is fine
  locally; the deployment has its own value.
- Migrations are generated with `pnpm db:generate` and committed under
  `drizzle/`.

There is no login. Pick an identity from the user switcher in the header:
`admin@wavy.test` / `admin2@wavy.test` (admin), `alice@creator.test` /
`bob@creator.test` (creator).

## 2. Concurrent approvals

**What ships.** `approveSubmission` (`src/server/services/approval.ts`) runs the
entire check-then-write inside one transaction that begins with a row lock on
the campaign:

```sql
SELECT id, total_budget, payout_per_1k_views, status
FROM campaign WHERE id = $1
FOR UPDATE
```

Everything after that — re-reading the submission's status, summing what the
campaign has already committed, comparing against `total_budget`, writing the
approval, and flipping the campaign to `completed` — happens while that lock is
held. Two admins approving at the same moment are serialised by Postgres: the
second transaction blocks on the lock, and when it proceeds it reads the money
the first one just spent, so it fails with `BUDGET_EXCEEDED`. First come, first
served, decided by the database rather than by whichever request Node happened
to schedule first.

The submission's own status is re-read *after* the lock is taken. That is what
stops the same submission being approved twice by two concurrent calls — the
loser sees `approved` and fails with `SUBMISSION_NOT_PENDING`.

Covered by `src/tests/approval.test.ts`: two approvals against a budget that
covers one, a burst of six against a budget that covers two (asserting total
spend lands exactly on the budget, not over), and a double-approve of a single
submission.

**What I tried or ruled out.**

- *Check in the procedure, then write.* The first thing I wrote, and it is
  simply wrong — two requests both read "budget is fine" before either writes.
  The burst test fails against it.
- *`SERIALIZABLE` isolation.* Correct, but it surfaces as
  `could_not_serialize_access` (40001), which means a retry loop in application
  code and a serialisation failure that has to be translated into the
  `BUDGET_EXCEEDED` the UI acts on. More moving parts for the same guarantee.
- *A denormalised `campaign.spent_cents` column with an optimistic version
  check.* Fastest to read and it makes the ceiling a `CHECK` constraint, but
  views keep growing after approval, so the column has to be recomputed on
  every ingest run and it can drift from the metric rows. I would revisit this
  if the aggregate got slow (see §5).
- *Advisory locks (`pg_advisory_xact_lock`).* Works and avoids touching the
  campaign row, but it puts the invariant somewhere a reader of the schema
  cannot see. `FOR UPDATE` on the row the budget belongs to says what it means.

**Budget ceiling, precisely.** Earnings are
`floor(views / 1000) * payout_per_1k_views` on the submission's most recent
metric row. A campaign's committed spend is the sum of that over its `approved`
and `paid` submissions. An approval fails when `committed + earnings >
total_budget`, and the error carries `{ required, remaining }` so the UI can
say what is missing. When remaining spend reaches zero the campaign is set to
`completed` in the same transaction.

## 3. Assumptions I made

- **Approval-time budget checks are the only reservation.** `pnpm ingest`
  creates metric rows for *approved* submissions only, per the brief, so a
  freshly submitted clip has no views and its earnings are zero at review time.
  The ceiling therefore binds when a submission already has metrics (a
  re-review, a backfill, or the ingest running between review sessions), and
  the campaign reaching `completed` is what stops further approvals. A
  production version would reserve an estimated amount at approval; I did not
  invent that mechanism because the brief does not describe one.
- **Accrued earnings can exceed the budget; payouts cannot.** Views keep
  growing after approval, so the raw sum can pass `total_budget`. Reported
  spend is clamped to the budget and `budget_left` never goes negative
  (`campaignBudget` in `src/server/services/budget.ts`), which is what "never
  pays out more than `total_budget`" means in practice. Tested.
- **"Daily views" means new views per day, not the running total.** Metric rows
  hold a cumulative figure per submission, so the overview turns them into
  per-submission deltas with `LAG(...)` and sums those. The campaign period is
  produced with `generate_series`, so a day with no metric row is a zero rather
  than a hole. Ends at `LEAST(ends_at, CURRENT_DATE)` — no empty future
  columns.
- **Post URLs are validated on shape, not existence.** Host and path patterns
  per platform (`src/lib/post-url.ts`). URLs are normalised before insert
  (protocol, host case, trailing slash, tracking params dropped, YouTube's `v`
  kept) so two spellings of one post collide on the unique index instead of
  both being accepted.
- **`paid` is a terminal status that nothing sets.** It counts towards spend
  wherever `approved` does. There is no payout run in the brief, so there is no
  transition into it.
- **Money is integer cents everywhere,** in the database, the API and the Zod
  schemas. The campaign form takes cents directly and says so, rather than
  parsing a currency string.
- **Creators may submit to `active` campaigns only.** `draft`, `paused` and
  `completed` are rejected with `CAMPAIGN_NOT_ACTIVE`.

## 4. Left out on purpose

- **Real auth.** A signed (HMAC-SHA256) cookie holding a userId, plus the dev
  switcher, exactly as the brief allows. The signature is only there so the
  cookie cannot be edited by hand; role and ownership are re-checked against
  the database on every procedure.
- **Custom design.** shadcn/ui defaults, one added `next-themes` toggle. Effort
  went into states (loading, empty, error), keyboard/labelled form controls,
  `aria-invalid` on failed fields, table captions, and a live region on the
  filter bar.
- **A payout run**, notifications, file uploads, campaign deletion, an audit
  log, and a creator-facing campaign detail page. None are in the brief.
- **Rate limiting and CSRF hardening.** Both would be needed with real auth.
- **Component and E2E tests.** The suite covers the logic that can lose money
  or leak data; see §6.
- **Optimistic UI on approve/reject.** The result changes the campaign's budget
  and status, so it waits for the server and refetches. A wrong optimistic
  guess here would show a spend figure that is not real.

## 5. First thing I would fix with another day

**Replace the recomputed spend aggregate with a maintained
`campaign.spent_cents`.** Every approval and every overview load runs a
`DISTINCT ON` over the campaign's metric rows to find each submission's latest
view count. It is correct and it is indexed, but it is O(metric rows per
campaign) on a table that grows one row per approved submission per day — a
campaign running for a year with a few hundred clips is already six figures of
rows behind a query on the approval hot path. I would keep the value on the
campaign row, update it in the same transaction as the approval and at the end
of each ingest run, add a `CHECK (spent_cents <= total_budget)` so the
invariant lives in the schema, and keep the aggregate as a reconciliation job
that asserts the two agree.

Close behind: the `submission_metric` rows are cumulative, which makes every
"views in a window" question a window function. Storing the daily delta
alongside the total would make the chart and any future reporting a plain
`SUM`, at the cost of one derived column.

## 6. Tests, and why these

`pnpm test` — 44 tests, 7 files, against real Postgres. Row locks, unique
indexes and `FOR UPDATE` *are* the mechanism under test; a mocked database
would assert nothing.

| File | What it protects |
| --- | --- |
| `payout.test.ts` | The payout rule. Pure, so it gets the edges: sub-1,000 views pay nothing, 1,999 views pay for one thousand, integer cents for any rate, negative/NaN views. |
| `approval.test.ts` | The budget ceiling and concurrency: an approval that fits, one that does not (and stays `pending`), the `{ required, remaining }` on the typed error, auto-completion at zero, spend clamped when views keep growing, two simultaneous approvals, a burst of six landing exactly on the budget, and a double-approve of one submission. |
| `access-control.test.ts` | Role and ownership, through the real router. Anonymous callers, creators reaching admin procedures, creators approving with a valid submission id, and a creator reading another creator's submission **by hand-crafted id** — the case the brief calls out. Also that `create` takes the creator from the session, not the input. |
| `ingest.test.ts` | One row per approved submission per day; a second run for the same day leaves the rows byte-identical; views strictly increase across five consecutive days; one submission throwing still lets the others finish and lands in `report.failed`; growing views completing a campaign. |
| `submission.test.ts` | Submission rules: wrong URL shape, platform the campaign does not accept, non-active campaign, the same URL twice (including a differently-spelled duplicate), the same URL on a *different* campaign being fine, and two simultaneous identical submissions where only one is stored. |
| `queries.test.ts` | The correlated subqueries and the list/overview shape. These exist because of a real bug — see below. |
| `post-url.test.ts` | URL shape matching and normalisation. |

**A bug these caught.** The `pendingCount` and latest-views subqueries were
written as `WHERE s.campaign_id = ${campaigns.id}`. Drizzle renders a bare
column reference unqualified, so the SQL became `s.campaign_id = "id"` and
Postgres resolved `"id"` against the *subquery's* table — the correlation was
always false and the queries returned a confident zero instead of an error. It
showed up in the browser as a "Pending" column of zeroes next to a review queue
that plainly had rows. Fixed by qualifying the outer table
(`${campaigns}.id`), and `queries.test.ts` was added afterwards to pin the
counts, the earnings estimate, and the chart series including a day with no
metric row.

## 7. Where AI tooling was used, and what I corrected

Claude Code wrote most of this, with me directing the design and reviewing every
file. Where it needed correcting:

- **It reached for Next.js 16.** Latest on npm, and wrong: the brief says
  Next.js 15. Pinned to 15.5.25.
- **The correlated-subquery bug in §6 was AI-written and passed review.** The
  SQL reads correctly in TypeScript; the flaw is only visible in the rendered
  string. I found it in the browser, not in the code, which is why the
  regression tests for it are query-level rather than unit-level.
- **The concurrency handling was wrong on the first pass** — a check in the
  procedure followed by a write, no lock. It looks fine and passes a
  single-threaded test. I asked for the burst test before the fix, watched it
  fail, then moved the whole thing into one locked transaction.
- **`z.coerce.date()` in the shared schema** typed the form's input as
  `unknown` and broke react-hook-form's generics. The fix was not a cast: since
  superjson carries `Date` over the wire, `z.date()` is the correct schema for
  both sides.
- **Chart bars rendered invisibly.** Two separate causes, both needing a
  browser to see: the base palette's `--chart-1` is near-white on a light
  background, and recharts' entry animation froze at its first frame under
  React 19. Switched to `--chart-2` and disabled the animation.
- **It suggested a REST route handler** for the metrics endpoint. The brief
  rules that out; `/api/trpc/[trpc]` is the only route handler and it carries no
  app data of its own.

The pattern: it is fast and mostly right on shape, and unreliable on anything
where the code reads correctly but the runtime behaviour differs — generated
SQL, race conditions, rendered colour. Those are the places I checked by hand.

## 8. Deployment

Vercel (app) plus Neon (Postgres 16, `eu-central-1`). Only `DATABASE_URL` and
`AUTH_SECRET` differ from local; there is no deployment-specific code path.

Two things were worth getting right rather than accepting the default:

- **Functions are pinned to `fra1`** (`vercel.json`). Vercel defaulted to
  `iad1`, which put every query on a transatlantic round trip to a Frankfurt
  database. That is bad for page loads and worse for correctness-adjacent
  reasons: the approval path issues several queries *while holding the campaign
  row lock*, so cross-region latency directly lengthens the window other
  admins are blocked for. Same region takes the heaviest page from ~940 ms to
  ~360 ms warm.
- **Prepared statements are disabled when the URL points at a pooler**
  (`src/server/db/index.ts`). Neon's `-pooler` host is PgBouncer in transaction
  mode and cannot serve them. The check is on the URL, so local development
  against plain Postgres keeps them. `postgres.js` is also capped at one
  connection per function instance on Vercel. Verified through the pooled URL:
  the locking transactions and the idempotent ingest both behave as they do
  locally.

The GitHub repo is connected, so pushes to `main` deploy automatically. The
live database was migrated and seeded once (`pnpm db:migrate`, `pnpm db:seed`
against the direct, non-pooled URL) and is not reseeded on deploy — `db:seed`
truncates, so re-running it would wipe anything you create while clicking
around.

`pnpm ingest` is not scheduled. It was run once against the live database so
the charts and earnings have data. Wiring it to a cron is a one-liner, but the
brief asks for a script, not a scheduler.

## 9. Where things are

```
drizzle/                          committed migrations
docker-compose.yml                Postgres 16 + the test database
vercel.json                       pins functions to fra1, next to the database
src/lib/payout.ts                 the payout rule, pure and integer-only
src/lib/post-url.ts               per-platform URL shape + normalisation
src/lib/validation/               Zod schemas shared by client and server
src/server/db/schema.ts           4 tables, enums, the two unique indexes
src/server/errors.ts              typed AppError -> error.data.appCode
src/server/services/approval.ts   the locked approve/reject transaction
src/server/services/budget.ts     spend, budget left, auto-completion
src/server/services/ingest.ts     the fake daily sync
src/server/trpc/                  context, role middlewares, routers
src/app/api/trpc/[trpc]/route.ts  the only route handler
src/tests/                        the suite described in §6
```
