# Docker Dev Stack — Design Spec

**Date:** 2026-05-04
**Scope:** Local dockerized development environment for the Electronics e-Commerce platform (Next.js + Express + Prisma + MySQL).
**Status:** Approved (pending user review of written spec).

## Goal

Make the project bootable from a fresh clone with a single `docker compose up -d --build` command — no host-installed MySQL, no host-installed Node version juggling — while preserving hot reload on both frontend and backend and persistence of the database across teardown cycles. This unblocks the product-reviews implementation, which currently can't proceed because there is no MySQL the developer can run migrations against.

## Non-Goals

- Production deployment images (no multi-stage builds, no `npm run build`, no Nginx).
- CI integration (no GitHub Actions, no test-only stack).
- A test database service (single dev DB; the few existing fetch-based smoke scripts run against it).
- Auth changes — the existing "client passes userId, server trusts it" pattern is preserved.

---

## Section 1 — Topology

Four services on a single user-defined bridge network (`singitronic`), one named volume for MySQL data persistence.

| Service  | Image                  | Host Port | Container Port | Notes                                    |
|----------|------------------------|-----------|----------------|------------------------------------------|
| `mysql`  | `mysql:8.0`            | 3306      | 3306           | Healthcheck on `mysqladmin ping`         |
| `express`| built from `server/Dockerfile.dev` | 3001 | 3001       | `depends_on: mysql (service_healthy)`    |
| `nextjs` | built from `Dockerfile.dev`        | 3000 | 3000       | No `depends_on` — Next survives Express restarts |
| `adminer`| `adminer:4`            | 8080      | 8080           | Optional DB GUI                          |

Single named volume: `mysql_data` mounted at `/var/lib/mysql`.

Anonymous volumes shadow the bind mounts to keep host `node_modules` and `.next` from leaking in:
- `nextjs`: `/app/node_modules`, `/app/.next`
- `express`: `/app/server/node_modules`

DNS: services reach each other by container name (`mysql`, `express`, `nextjs`). The browser, which runs on the host, hits the published ports on `localhost`.

## Section 2 — File Manifest

**New files:**
- `docker-compose.yml` — service definitions
- `Dockerfile.dev` — Next.js image (project root)
- `server/Dockerfile.dev` — Express image
- `.dockerignore` — root-level
- `server/.dockerignore` — server-level
- `.env.docker` — runtime env (gitignored)
- `.env.docker.example` — committed sibling, fresh-clone discovery

**Modified files:**
- `lib/config.ts` — add `internalApiBaseUrl`
- `lib/api.ts` — branch on `typeof window === 'undefined'`
- `.gitignore` — add `.env.docker` line
- `README.md` — add Docker quickstart + troubleshooting

## Section 3 — Dockerfile Contents

Both Dockerfiles use `node:20-bookworm-slim` (small, glibc-based — Prisma's default binary targets work; no `linux-musl` engine needed).

**`Dockerfile.dev`** (Next.js, project root):

```dockerfile
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npm run dev"]
```

**`server/Dockerfile.dev`** (Express):

```dockerfile
FROM node:20-bookworm-slim

WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm install

COPY server/ ./
COPY prisma /app/prisma

EXPOSE 3001

CMD ["sh", "-c", "npx prisma generate --schema=/app/prisma/schema.prisma && node --watch app.js"]
```

**Why this shape:**
- `prisma generate` runs at container start, not at build time, so schema edits don't force an image rebuild.
- Express uses Node 20's native `--watch` flag instead of nodemon — no new dependency.
- Source is bind-mounted at runtime via compose, so the `COPY . .` is mainly for image-without-compose use; at runtime the bind mount wins.

## Section 4 — Env Layout & Dual-URL Switch

**`.env.docker`** — single env file loaded by both `nextjs` and `express` services via compose `env_file:`.

```
# MySQL
DATABASE_URL="mysql://root:dockerpass@mysql:3306/electronics_db"

# Server runtime
PORT=3001
NODE_ENV=development

# CORS allow-list
NEXTAUTH_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"

# NextAuth
NEXTAUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_STRING"

# Dual API base URLs
NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"
INTERNAL_API_BASE_URL="http://express:3001"
```

The bare-metal stubs (`.env` and `server/.env`) stay as-is — they're the non-Docker path. Both gitignored.

**`lib/config.ts`** — add internal URL:

```ts
apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
internalApiBaseUrl: process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
```

**`lib/api.ts`** — pick base at request time:

```ts
async request(endpoint, options = {}) {
  const base = typeof window === 'undefined'
    ? config.internalApiBaseUrl
    : config.apiBaseUrl;
  const url = `${base}${endpoint}`;
  // ... existing fetch logic unchanged
}
```

**Why this shape:**
- One env file keeps compose readable.
- `INTERNAL_API_BASE_URL` lacks the `NEXT_PUBLIC_` prefix → it is *not* inlined into the browser bundle. Server-only by construction.
- `typeof window === 'undefined'` is the standard SSR/server-component branch.
- Falls back to the public URL outside Docker — bare-metal devs see zero behavior change.

## Section 5 — Workflow

**One-time setup**

```bash
cp .env.docker.example .env.docker
# Edit NEXTAUTH_SECRET → openssl rand -base64 32

docker compose up -d --build
docker compose exec express npx prisma migrate dev --schema=/app/prisma/schema.prisma
docker compose exec express node prisma/seed.js   # optional
```

Reachable at:
- Next.js → `http://localhost:3000`
- Express → `http://localhost:3001`
- Adminer → `http://localhost:8080` (server `mysql`, user `root`, pass `dockerpass`)

**Daily use**

```bash
docker compose up -d            # start
docker compose logs -f nextjs   # tail one service
docker compose down             # stop, keep volumes
```

Code changes:
- `app/`, `components/`, `lib/`, `server/` edits → hot reload via bind mount.
- `prisma/schema.prisma` edit → `docker compose exec express npx prisma migrate dev --name <change>` then `docker compose restart express nextjs`.
- `package.json` dep change → `docker compose up -d --build <service>`.

**Teardown**

```bash
docker compose down       # keep DB
docker compose down -v    # full reset
```

**Troubleshooting** (will land in README):
- "express can't reach mysql" → `docker compose ps`; check `docker compose logs mysql`.
- CORS error in browser → confirm `FRONTEND_URL` matches the URL the browser uses.
- Prisma client out of sync → `docker compose restart express nextjs`.

---

## Invariants Preserved

- `apiClient` (`lib/api.ts`) remains the only path the frontend uses to reach Express.
- The "client trusts userId" auth pattern is unchanged.
- The bare-metal dev path (`npm run dev` at root + `npm run dev` in `server/` against a host MySQL) still works — Docker is purely additive.
- Existing controllers/routes/services split inside `server/` is untouched.
- The Prisma singleton (`server/utills/db.js`) and the dual `prisma generate` (root + server) workflow are preserved.

## Risks / Open Questions

- **macOS bind-mount perf** — large `node_modules` over osxfs is slow. Anonymous volumes for `node_modules` mitigate the worst case. If still too slow, follow-up: explore `:cached` consistency or move to named volumes for `node_modules`.
- **Prisma binary targets** — `node:20-bookworm-slim` is glibc-based, so default Prisma engines work. If a contributor swaps to an Alpine base image, they'll need to add `binaryTargets = ["native", "linux-musl"]` to `schema.prisma`. Document in README.
- **Port collisions** — 3000/3001/3306/8080 are conventional; if a host already runs MySQL on 3306, compose will fail to publish. Document the override knob (`MYSQL_HOST_PORT`) as a future enhancement, not for MVP.
