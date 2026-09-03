# Clipping marketplace

Brands post paid clipping campaigns. Creators submit short-form clips and earn
per 1,000 views, up to the campaign budget.

Take-home for a full-stack role. **See [NOTES.md](./NOTES.md)** for the setup
steps, how concurrent approvals are handled, what was left out on purpose, and
where AI tooling was used.

## Quick start

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm ingest
pnpm dev
```

Then open http://localhost:3000 and pick a user from the switcher in the header.
There is no login — `admin@wavy.test` for the admin side, `alice@creator.test`
for the creator side.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | production build and serve |
| `pnpm test` | Vitest against the `wavy_test` database |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint |
| `pnpm db:generate` | generate a migration from `schema.ts` |
| `pnpm db:migrate` | apply committed migrations |
| `pnpm db:seed` | reset and reseed the dev database |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm ingest` | fake a daily metrics sync (`--day=YYYY-MM-DD` optional) |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · tRPC v11 ·
Drizzle ORM on Postgres 16 · TailwindCSS v4 · shadcn/ui · next-themes ·
react-hook-form with Zod 4 · Recharts · Vitest
