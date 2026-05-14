# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a **two-process monorepo** (no workspaces tool — just two `package.json`s):

- **Root** — Next.js 15 App Router frontend + admin dashboard (TypeScript, React 18, Tailwind/daisyUI/Flowbite). Dev server on `:3000`.
- **`server/`** — Express 4 REST API in plain JavaScript (CommonJS). Runs on `:3001`. Owns all DB writes through Prisma.
- **`prisma/`** — single `schema.prisma` shared by both processes. Migrations live here. The Express layer reaches into the **root** `node_modules/@prisma/client` first (`server/utills/db.js`) so the generated client matches the root schema even when run from `server/`.

Both processes talk to the same MySQL database via `DATABASE_URL`. The `.env` at the repo root is for Next.js; `server/.env` is for Express. They typically share the same `DATABASE_URL`.

## Commands

### Local (without Docker)
```bash
npm install                        # root deps (Next.js)
cd server && npm install           # server deps
npx prisma migrate dev             # run from server/ (or root) — schema is at ../prisma
node server/utills/insertDemoData.js   # seed demo products/categories
node server/app.js                 # API on :3001
npm run dev                        # Next.js on :3000 (root); also runs `prisma generate`
```

### Build / lint
```bash
npm run build           # prisma generate + next build (root)
npm run lint            # next lint (root) — only linter wired up
npm run db:studio       # Prisma Studio
npm run db:push         # push schema without a migration (dev only)
```

### Docker stack (preferred for full-stack dev)
```bash
cp .env.docker.example .env.docker                                            # then edit, generate NEXTAUTH_SECRET
docker compose up -d --build
docker compose exec express npx prisma migrate dev --schema=/app/prisma/schema.prisma
```
Adminer GUI at `:8080`. Code in `app/`, `components/`, `lib/`, `server/` hot-reloads via bind mount. After a `package.json` change, rebuild the affected service (`docker compose up -d --build nextjs|express`) — anonymous `node_modules` volumes need regenerating. After a schema change, `docker compose restart express nextjs` to refresh the Prisma client. If SSR pages start failing with `ECONNREFUSED 127.0.0.1:3001` after editing `lib/api.ts` / `lib/config.ts`, blow away the cached `.next`: `docker compose exec nextjs rm -rf .next && docker compose restart nextjs`.

### Tests
There is **no automated test runner** wired up. `server/tests/` and `server/scripts/` are ad-hoc Node scripts you run directly (e.g. `node server/tests/test-reviews-api.js`). The README documents 350+ manual test scripts as the actual QA process. Don't assume `npm test` works (it intentionally exits 1 in `server/package.json`).

### Logs
Express writes Winston logs to `server/logs/{access,error,security}.log`. View them with `npm run logs` / `logs:access` / `logs:error` / `logs:security` / `logs:analyze` from `server/`.

## Architecture notes that span files

### SSR vs browser API base URL
`lib/config.ts` exposes both `apiBaseUrl` (browser) and `internalApiBaseUrl` (SSR / inside Docker network). `lib/api.ts` picks based on `typeof window`. **When adding fetches from server components or route handlers, always go through `apiClient` from `lib/api.ts`** — hardcoding `http://localhost:3001` breaks Docker SSR (the container can't reach the host port) and the cached `.next` issue above.

### Auth
- NextAuth (`app/api/auth/[...nextauth]/route.ts`) with a custom `Credentials` provider that calls Prisma directly through `utils/db.ts`. JWT strategy, **15-minute session maxAge**, role baked into the token.
- `middleware.ts` gates `/admin/*` to `token.role === "admin"`.
- The Express API does **not** verify NextAuth JWTs — it trusts callers and relies on rate limits + CORS allowlist (`server/app.js`). When adding sensitive endpoints, add auth checks; don't assume the front-end is the only caller.
- Admin user creation: `server/createAdminUser.js`, `makeUserAdmin.js`, `listUsers.js`.

### Two Prisma client instances
- Root `utils/db.ts` (TypeScript, used by Next.js) and `server/utills/db.js` (JS, used by Express) are independent singletons but generated from the **same** `prisma/schema.prisma`. After schema changes you need `prisma generate` for both — `npm run dev` does it root-side; on the server side it happens at container start (`server/Dockerfile.dev`) or you run it manually.
- Note the typo: the server-side folder is `server/utills/` (two L's), not `utils/`. Don't "fix" it — many requires depend on it.

### State (Zustand) — `app/_zustand/`
- `store.ts` — cart (persists to **`sessionStorage`**, not localStorage; logging out / closing tab clears it).
- `wishlistStore.ts`, `notificationStore.ts`, `paginationStore.ts`, `sortStore.ts`.

### Express request pipeline (`server/app.js`)
Order matters: `addRequestId` → `securityLogger` → `requestLogger` → `errorLogger` → `generalLimiter` → `express.json` → CORS → `fileUpload` → per-route limiters → routers → 404 → `handleServerError`.

CORS allowlist is built from `NEXTAUTH_URL`, `FRONTEND_URL`, plus `localhost:3000/3001`. In `NODE_ENV=development` any `http://localhost:*` origin is allowed.

Rate limits are aggressive (`server/middleware/rateLimiter.js`) — when seeding/load-testing, hit endpoints from a non-rate-limited path or temporarily disable.

### Error handling pattern (server)
Controllers wrap every handler in `asyncHandler` from `server/utills/errorHandler.js` and throw `AppError(message, statusCode)` for expected failures. Prisma error codes (`P2002`, `P2025`, `P2003`, …) get mapped to HTTP status in `handleServerError`. **Don't** add try/catch in controllers; let `asyncHandler` surface to the global handler.

### Reviews + product rating
`Review` is keyed `@@unique([productId, userId])` (one review per user per product). `Product.rating` is a denormalized rounded average. **Always** call `recomputeProductRating(productId, tx)` from `server/services/productRating.js` inside the same Prisma `$transaction` as any review create/update/delete — see `server/controllers/reviews.js` for the pattern. Skipping it leaves `Product.rating` stale.

### Bulk product upload
End-to-end pipeline: `app/(dashboard)/admin/bulk-upload` → `POST /api/bulk-upload` → `server/services/bulkUploadService.js` → `bulk_upload_batch` + `bulk_upload_item` rows for audit. CSV templates live at the repo root (`product-template*.csv`, `bulk-upload-example.csv`). Detailed flow + troubleshooting in `BULK-UPLOAD-*.md` and `TROUBLESHOOTING-DELETE-BATCH.md`.

### Admin routes
Everything under `app/(dashboard)/admin/*` (route group — the `(dashboard)` segment doesn't appear in URLs). Dashboard layout is `app/(dashboard)/layout.tsx`. The middleware redirects non-admin users back to `/`.

## Conventions to follow

- **Path alias** `@/*` maps to repo root (`tsconfig.json`). Use `@/components/...`, `@/lib/...`, `@/utils/...`.
- **Components** are flat under `components/` (no per-feature folders except `components/modules/{cart,wishlist}`). The barrel `components/index.ts` re-exports most of them.
- **Server controllers** use `asyncHandler` + `AppError` exclusively — match this when adding endpoints.
- **TypeScript strict mode** is on. Don't loosen `tsconfig.json`.
- **Sanitize HTML** going into the DOM with `lib/sanitize.ts` / `lib/form-sanitize.ts` (DOMPurify) — they exist for a reason; product descriptions and review comments are user content.

## Things that look broken but aren't

- `server/utills/` (extra L) — see above.
- `wishlistRouter` is commented out in `server/app.js` and route file is gone — wishlist currently lives only in Zustand client state. Don't re-enable without checking the route file.
- `e-commerce.zip` and `e-commerce-session-history.zip` at the root are large untracked archives, not build artifacts — leave them alone.

## ByteRover memory layer (`.brv/`)

The `.brv/` directory is the ByteRover knowledge base for this project. **It is its own nested git repo** with full history of all curated knowledge, pushed to its own GitHub remote: <https://github.com/hungnguyen-codelink/Electronics-eCommerce-Shop-NextJS-NodeJS-brv> (private). We do *not* use `brv vc` (their cloud sync requires a subscription) — regular `git` runs inside `.brv/` itself. The main repo's `.gitignore` excludes `.brv/` entirely so it never appears in main-repo diffs.

> ⚠ **The brv daemon manages `.brv/.git` autonomously.** When `brv review approve` runs, the daemon may re-initialize `.git`, fetch+reset to align with curated content, and **auto-commit** changes (e.g. the `chore: bootstrap standalone repo` commit). Don't be surprised by commits you didn't make. Your local commits can be overwritten by the daemon's rewrites — if you have local work that hasn't been pushed, push it first, or store the SHA. The remote is the durable source of truth; if anything goes wrong locally, `git -C .brv fetch origin && git -C .brv reset --hard origin/main`.

### What's versioned vs. ignored (inside `.brv/`)

| Path (relative to `.brv/`) | Status |
|---|---|
| `context-tree/**/*.md` | **Tracked** — curated knowledge. Commit it. |
| `config.json` | **Tracked** — project-level brv config (no secrets). |
| `.gitignore` | **Tracked** — defines what's runtime state. |
| `_queue_status.json`, `dream-state.json`, `dream-log/`, `review-backups/`, `dream.lock`, `vc/` | **Ignored** — runtime state. |

### Day-to-day rules for Claude

1. **`.brv/` is a separate repo.** All git commands for memory commits must target it explicitly: `git -C .brv <command>` (or `cd .brv` first). Running `git status` in the main repo will *not* show memory changes.
2. **After every `brv curate` or hand-edit under `.brv/context-tree/`**, `git -C .brv add context-tree/` (and `config.json` if changed) and commit inside `.brv/`. Don't leave new memory uncommitted.
3. **Never run `brv vc` commands** — there's no `.brv/vc/` repo, no `origin`, no `brv login`. If a workflow doc mentions them, ignore it and use regular git instead.
4. **Curate may queue pending reviews** instead of writing files directly. If `git -C .brv status` shows no `context-tree/` changes after a curate, check `brv review list` and approve with `brv review approve <taskId>`.
5. **Don't commit runtime files** — they're listed in `.brv/.gitignore`. If they ever sneak in, untrack with `git -C .brv rm --cached <file>`.
6. **Memory commits live in the `.brv/` repo only** — they will never appear in the main repo's `git log`. Use a clear prefix in the commit message (e.g. `memory:` or `docs(brv):`) so they're easy to spot in `git -C .brv log`.
7. **Branches & merges use regular git** — `git -C .brv checkout -b ...` for risky restructures of the context tree, normal merge conflict resolution in the Markdown files.
8. **Push regularly.** Because the brv daemon can rewrite local history during a review-approve, `git -C .brv push` after every curate session so the remote always has the latest curated state. If the daemon's auto-commits diverge from local, `git -C .brv pull --rebase` or `reset --hard origin/main` to reconcile.

### Quick reference

```bash
brv curate "..."                                    # writes Markdown into .brv/context-tree/
git -C .brv status                                  # see what changed in the memory repo
git -C .brv add context-tree/ config.json
git -C .brv commit -m "memory: <what you learned>"
git -C .brv push                                    # push to private GitHub remote

brv review list                                     # if curate queued a review
brv review approve <taskId>                         # then re-run the commit/push flow above
```
