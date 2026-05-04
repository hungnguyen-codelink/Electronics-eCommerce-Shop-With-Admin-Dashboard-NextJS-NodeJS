# Decision Note — Docker Dev Stack

**Date:** 2026-05-04
**Spec:** [2026-05-04-docker-dev-stack-design.md](./2026-05-04-docker-dev-stack-design.md)

## Context

The product-reviews feature was approved and decomposed into a 14-task TDD plan, but we couldn't dispatch the first implementer subagent because there is no runnable `DATABASE_URL` — neither `.env` nor `server/.env` existed, and no MySQL is installed on the developer's host. We considered shipping stub `.env` files (option B during the unblock conversation), but the user chose to invest in a full local Docker stack instead so future contributors aren't blocked by the same hole.

The codebase already has two Prisma "sides" — the root `prisma generate` (used by Next.js for type generation) and the `server/` Prisma client (used at runtime by Express). Any container layout has to feed both, and the existing `lib/api.ts` apiClient assumes a single base URL — which breaks the moment Next.js does a server-side fetch from inside a container, because `localhost:3001` no longer means "Express." Both of these constrain the design.

## Choice

Ship a four-service Docker Compose stack — `mysql:8.0`, `express` (built from `server/Dockerfile.dev`), `nextjs` (built from `Dockerfile.dev`), and an optional `adminer` GUI — all on a single user-defined bridge network with one named volume (`mysql_data`) for DB persistence. Both Node services use `node:20-bookworm-slim`, run `prisma generate` at container start (not build time), and use bind-mounted source plus anonymous `node_modules` volumes for hot reload. Express uses Node 20's native `node --watch`; Next.js uses `npm run dev`. Migrations stay manual: `docker compose exec express npx prisma migrate dev`. A new `INTERNAL_API_BASE_URL` env var plus a `typeof window === 'undefined'` branch inside `apiClient.request` lets the browser keep hitting `localhost:3001` while server-side code hits `http://express:3001`.

## Alternatives Rejected

- **Stub `.env` files only (option B during unblock)** — would have shipped product-reviews faster but punted the bootstrap problem to every future contributor. User chose to fix it once.
- **Dev-and-test variants of the stack** — rejected at Q1; existing tests are fetch-based smoke scripts that run fine against the dev DB. Not worth a second compose file or a `test_` MySQL service.
- **Single shared API URL with `host.docker.internal`** — rejected at Q2; pinning Next.js's server-side fetches to the host's loopback address adds Docker-specific magic that breaks bare-metal devs. The dual-URL switch is explicit and falls back cleanly.
- **Ephemeral DB (no persistent volume)** — rejected at Q3; losing seed data on every `docker compose down` would be punishing during the 14-task product-reviews implementation, which writes review fixtures.
- **Nodemon for backend hot reload** — rejected at Q4 in favor of `node --watch` (Node 20+, native, no new dependency).
- **Per-service `environment:` blocks in compose** — rejected at Q5; one shared `.env.docker` keeps the compose file readable and makes secrets discoverable in one place.
- **Production-grade multi-stage Dockerfiles** — explicit non-goal; would slow rebuilds and add Nginx/build-output complexity that's irrelevant to local dev.
- **Alpine base image** — rejected implicitly; `node:20-bookworm-slim` is small enough and avoids the `linux-musl` Prisma binary-target footgun.
- **Test database service** — rejected at Q1; tests run against the dev DB, matching current convention.
- **Override knob for MySQL host port (e.g. `MYSQL_HOST_PORT`)** — rejected for MVP; collision with a host MySQL on 3306 is a known risk, documented in README, deferred until it actually bites someone.

## Invariants Preserved

- **`apiClient` (`lib/api.ts`) remains the only path the frontend uses to reach Express.** The dual-URL switch lives inside `request()`, not at every callsite — adding the branch *strengthens* the invariant rather than fracturing it.
- **The "client passes userId, server trusts it" auth pattern is untouched.** Docker doesn't introduce a competing auth model.
- **The bare-metal dev path still works** — `npm run dev` at root + `npm run dev` in `server/` against a host MySQL continues to function. Docker is purely additive; nothing in `server/app.js`, `lib/api.ts`, or the `.env` stubs forces a Docker-only flow.
- **The Prisma singleton (`server/utills/db.js`) and the dual `prisma generate` (root + server) workflow are unchanged.** The Express container runs `prisma generate --schema=/app/prisma/schema.prisma` to point at the shared root schema, matching the existing single-source-of-truth shape.
- **The `controllers/` + `routes/` + `services/` split inside `server/`** is not touched by this change — Docker is purely environmental.
- **`INTERNAL_API_BASE_URL` is server-only by construction** — lacking the `NEXT_PUBLIC_` prefix means it cannot leak into the browser bundle, preserving the existing rule that only `NEXT_PUBLIC_*` env vars cross the SSR boundary.

## In-flight Refinements

None yet.
