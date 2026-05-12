# Docker Dev Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Next.js + Express + Prisma + MySQL stack bootable from a fresh clone via `docker compose up -d --build`, with hot reload and persistent DB.

**Architecture:** Four-service compose stack (mysql, express, nextjs, adminer) on a single bridge network with one named volume for MySQL. Bind-mount source for hot reload, anonymous `node_modules` volumes to shadow host installs. Dual API base URLs — `INTERNAL_API_BASE_URL` for server-side (Docker DNS), `NEXT_PUBLIC_API_BASE_URL` for the browser (host loopback) — switched inside `lib/api.ts` via a `typeof window` check.

**Tech Stack:** Docker Compose v2, `mysql:8.0`, `node:20-bookworm-slim`, `adminer:4`, Prisma 6, Node 20 native `--watch`.

**Spec:** [docs/superpowers/specs/2026-05-04-docker-dev-stack-design.md](../specs/2026-05-04-docker-dev-stack-design.md)

**Decision Note:** [docs/superpowers/specs/2026-05-04-docker-dev-stack-decision.md](../specs/2026-05-04-docker-dev-stack-decision.md)

---

## Pre-flight checklist

Before starting:
1. Confirm Docker Desktop (or Colima/OrbStack) is installed: `docker --version` and `docker compose version` should both succeed.
2. Confirm host ports 3000, 3001, 3306, and 8080 are free: `lsof -nP -iTCP -sTCP:LISTEN | grep -E '3000|3001|3306|8080'` should return no output. If something is listening, stop it before continuing.
3. Confirm you are on the `feature/product-reviews` branch (or whatever branch this Docker work is happening on): `git branch --show-current`.

---

## Task 1: Env files and `.gitignore` update

**Files:**
- Create: `.env.docker.example` (committed)
- Create: `.env.docker` (gitignored)
- Modify: `.gitignore`

- [ ] **Step 1: Add `.env.docker` to `.gitignore`**

The current `.gitignore` ignores `.env*.local` and `.env` but not `.env.docker`. Add an explicit entry so the Docker env file with secrets is never committed.

Open `.gitignore` and find the local env files section (around line 28–30):

```
# local env files
.env*.local
.env
```

Change it to:

```
# local env files
.env*.local
.env
.env.docker
```

- [ ] **Step 2: Verify the new entry is honored**

Run: `git check-ignore -v .env.docker`
Expected: prints a line ending with `.env.docker` confirming the rule matched.

- [ ] **Step 3: Create `.env.docker.example` (committed template)**

```bash
cat > .env.docker.example <<'EOF'
# Copy to .env.docker and fill in NEXTAUTH_SECRET before running docker compose.
# .env.docker is gitignored.

# MySQL connection used by both Prisma clients (root and server).
DATABASE_URL="mysql://root:dockerpass@mysql:3306/electronics_db"

# MySQL container env (used by mysql:8.0 image)
MYSQL_ROOT_PASSWORD=dockerpass
MYSQL_DATABASE=electronics_db

# Express runtime
PORT=3001
NODE_ENV=development

# CORS allow-list — must match the URL the browser uses
NEXTAUTH_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"

# NextAuth — generate with: openssl rand -base64 32
NEXTAUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_STRING"

# Browser-side API base URL (host loopback, hits published port)
NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"

# Server-side API base URL (Docker DNS, container-to-container)
INTERNAL_API_BASE_URL="http://express:3001"
EOF
```

- [ ] **Step 4: Create `.env.docker` for local use**

```bash
cp .env.docker.example .env.docker
```

Then generate a real `NEXTAUTH_SECRET` and replace the placeholder:

```bash
SECRET=$(openssl rand -base64 32)
sed -i.bak "s|REPLACE_WITH_A_LONG_RANDOM_STRING|${SECRET}|" .env.docker && rm .env.docker.bak
```

- [ ] **Step 5: Verify `.env.docker` will not be committed**

Run: `git status --short .env.docker`
Expected: empty output (file is ignored, won't show as untracked).

Run: `git status --short .env.docker.example`
Expected: `?? .env.docker.example` (the template is untracked but ready to add).

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.docker.example
git commit -m "chore(docker): add env file template and gitignore entry"
```

---

## Task 2: Root `.dockerignore`

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```bash
cat > .dockerignore <<'EOF'
# Don't ship host artifacts into the build context
node_modules
.next
.git
.gitignore
.vscode
.idea
.DS_Store

# Logs
*.log
logs/
npm-debug.log*

# Local env (we inject via env_file at runtime, not bake in)
.env
.env*.local
.env.docker
.env.docker.example

# Worktrees and brv state
.worktrees/
.brv/

# Backups & SQL dumps
backups/
*.sql
*.dump
*.backup

# Server-specific (handled by server/.dockerignore in server build)
server/node_modules
server/logs

# Tests / coverage
coverage/

# Docs (not needed at runtime)
docs/
EOF
```

- [ ] **Step 2: Verify the file exists**

Run: `wc -l .dockerignore`
Expected: prints a number > 20 followed by the filename.

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore(docker): add root .dockerignore"
```

---

## Task 3: Server `.dockerignore`

**Files:**
- Create: `server/.dockerignore`

- [ ] **Step 1: Write `server/.dockerignore`**

```bash
cat > server/.dockerignore <<'EOF'
node_modules
logs
*.log
.env
.DS_Store
EOF
```

- [ ] **Step 2: Verify**

Run: `cat server/.dockerignore | wc -l`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add server/.dockerignore
git commit -m "chore(docker): add server/.dockerignore"
```

---

## Task 4: `Dockerfile.dev` for Next.js

**Files:**
- Create: `Dockerfile.dev`

- [ ] **Step 1: Write the Dockerfile**

```bash
cat > Dockerfile.dev <<'EOF'
# Dev image for Next.js — bind-mount the source at runtime; this image is a
# fallback for `docker run` without compose.
FROM node:20-bookworm-slim

WORKDIR /app

# Install OS deps Prisma needs (openssl for query engine TLS, ca-certificates).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first for better Docker layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source (overridden by bind mount when run via compose).
COPY . .

EXPOSE 3000

# Generate Prisma client at start (schema may have changed since the build).
# Then run `npm run dev` for HMR.
CMD ["sh", "-c", "npx prisma generate && npm run dev"]
EOF
```

- [ ] **Step 2: Build the image to verify the Dockerfile parses and installs cleanly**

Run: `docker build -f Dockerfile.dev -t electronics-nextjs:dev .`
Expected: ends with `Successfully tagged electronics-nextjs:dev` (or equivalent buildx success line). First build takes 2–5 minutes.

If build fails: read the error. Common issues — missing `package-lock.json` (run `npm install` on host first to generate it), or Docker daemon not running.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.dev
git commit -m "chore(docker): add Dockerfile.dev for nextjs dev image"
```

---

## Task 5: `server/Dockerfile.dev` for Express

**Files:**
- Create: `server/Dockerfile.dev`

- [ ] **Step 1: Write the Dockerfile**

The Express image is built from the **project root** so the Prisma schema (one level above `server/`) is reachable in the build context.

```bash
cat > server/Dockerfile.dev <<'EOF'
# Dev image for Express. Built from the project root so prisma/schema.prisma
# is in scope — the schema lives at the repo root and is shared with Next.js.
FROM node:20-bookworm-slim

WORKDIR /app/server

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy server manifests first for caching.
COPY server/package.json server/package-lock.json* ./
RUN npm install

# Copy the rest of the server source.
COPY server/ ./

# Copy the shared Prisma schema (lives at the repo root).
COPY prisma /app/prisma

EXPOSE 3001

# Generate the Prisma client pointing at the shared schema, then run with
# Node 20's native --watch (no nodemon needed).
CMD ["sh", "-c", "npx prisma generate --schema=/app/prisma/schema.prisma && node --watch app.js"]
EOF
```

- [ ] **Step 2: Build the image (from project root, with -f pointing at the server file)**

Run: `docker build -f server/Dockerfile.dev -t electronics-express:dev .`
Expected: ends with `Successfully tagged electronics-express:dev`. Should be faster than Task 4 since it's smaller.

- [ ] **Step 3: Commit**

```bash
git add server/Dockerfile.dev
git commit -m "chore(docker): add server/Dockerfile.dev for express dev image"
```

---

## Task 6: `docker-compose.yml` — MySQL service only (boot first, prove healthy)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write the initial compose file with mysql only**

```bash
cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    container_name: electronics-mysql
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 30s
    networks:
      - singitronic

volumes:
  mysql_data:

networks:
  singitronic:
    driver: bridge
EOF
```

- [ ] **Step 2: Boot mysql and wait for healthy**

```bash
docker compose up -d mysql
```

Then poll for health (give it up to ~30s):

```bash
until [ "$(docker inspect -f '{{.State.Health.Status}}' electronics-mysql)" = "healthy" ]; do
  echo "waiting for mysql..."; sleep 2;
done
echo "mysql healthy"
```

Expected: prints `mysql healthy` within ~30 seconds. If it sticks at `starting` for >60s, run `docker compose logs mysql` to see what's wrong (commonly: port 3306 already in use on host — kill the host MySQL or change the published port).

- [ ] **Step 3: Verify the database exists**

```bash
docker compose exec mysql mysql -uroot -pdockerpass -e "SHOW DATABASES;"
```

Expected: output includes a row with `electronics_db`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): add compose stack with mysql service"
```

---

## Task 7: Add `express` service to compose, run first migration

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Append `express` service to compose**

Replace the contents of `docker-compose.yml` with the version below. The mysql block is unchanged; the `express` block is new.

```bash
cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    container_name: electronics-mysql
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 30s
    networks:
      - singitronic

  express:
    build:
      context: .
      dockerfile: server/Dockerfile.dev
    container_name: electronics-express
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3001:3001"
    volumes:
      # Bind-mount source for hot reload.
      - ./server:/app/server
      - ./prisma:/app/prisma
      # Anonymous volume to keep the container's node_modules from being
      # shadowed by the host's.
      - /app/server/node_modules
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - singitronic

volumes:
  mysql_data:

networks:
  singitronic:
    driver: bridge
EOF
```

- [ ] **Step 2: Build and start express**

```bash
docker compose up -d --build express
```

Expected: build runs (cached on the manifest layer from Task 5), container starts. Run `docker compose ps` — you should see `electronics-express` as `Up` with port `0.0.0.0:3001->3001/tcp`.

- [ ] **Step 3: Tail logs to confirm Express is up but DB is empty**

```bash
docker compose logs --tail 50 express
```

Expected: lines including `Server running on port 3001` and `Rate limiting and request logging enabled...`. Express boots without DB schema — Prisma queries will only fail when actually invoked.

- [ ] **Step 4: Run the initial Prisma migration inside the container**

```bash
docker compose exec express npx prisma migrate dev --schema=/app/prisma/schema.prisma --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/` on the host (via the bind mount), applies the migration to MySQL, and prints `Your database is now in sync with your schema.`

If you already have migration files in `prisma/migrations/`, this command will instead apply them and skip generation. Both outcomes are correct.

- [ ] **Step 5: Smoke-test the API**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/products
```

Expected: `200` (returns an empty array if no products are seeded — that's fine; a non-zero exit / non-200 means Express can't reach MySQL).

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git add prisma/migrations/   # only if a new migration was generated
git commit -m "chore(docker): add express service and run initial prisma migration"
```

---

## Task 8: Add `nextjs` service to compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Append `nextjs` service**

```bash
cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    container_name: electronics-mysql
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 30s
    networks:
      - singitronic

  express:
    build:
      context: .
      dockerfile: server/Dockerfile.dev
    container_name: electronics-express
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3001:3001"
    volumes:
      - ./server:/app/server
      - ./prisma:/app/prisma
      - /app/server/node_modules
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - singitronic

  nextjs:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: electronics-nextjs
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      # Anonymous volumes shadow the host's node_modules and .next so the
      # container uses its own.
      - /app/node_modules
      - /app/.next
    networks:
      - singitronic

volumes:
  mysql_data:

networks:
  singitronic:
    driver: bridge
EOF
```

- [ ] **Step 2: Build and start nextjs**

```bash
docker compose up -d --build nextjs
```

- [ ] **Step 3: Tail logs to confirm Next compiles**

```bash
docker compose logs --tail 80 nextjs
```

Expected: includes `Ready in <time>` (or `started server on 0.0.0.0:3000`). First compile can take 30–90 seconds.

- [ ] **Step 4: Smoke-test the home page**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): add nextjs service to compose"
```

---

## Task 9: Add `adminer` service to compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Append `adminer` service**

```bash
cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    container_name: electronics-mysql
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 30s
    networks:
      - singitronic

  express:
    build:
      context: .
      dockerfile: server/Dockerfile.dev
    container_name: electronics-express
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3001:3001"
    volumes:
      - ./server:/app/server
      - ./prisma:/app/prisma
      - /app/server/node_modules
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - singitronic

  nextjs:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: electronics-nextjs
    restart: unless-stopped
    env_file:
      - .env.docker
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    networks:
      - singitronic

  adminer:
    image: adminer:4
    container_name: electronics-adminer
    restart: unless-stopped
    ports:
      - "8080:8080"
    depends_on:
      - mysql
    networks:
      - singitronic

volumes:
  mysql_data:

networks:
  singitronic:
    driver: bridge
EOF
```

- [ ] **Step 2: Start adminer**

```bash
docker compose up -d adminer
```

- [ ] **Step 3: Verify the GUI responds**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080
```

Expected: `200`.

To use it visually: open `http://localhost:8080` in a browser, log in with system `MySQL`, server `mysql`, username `root`, password `dockerpass`, database `electronics_db`. You should see the existing tables.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): add adminer service to compose"
```

---

## Task 10: Add `internalApiBaseUrl` to `lib/config.ts`

**Files:**
- Modify: `lib/config.ts`

The current file is 6 lines:

```ts
const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
};

export default config;
```

- [ ] **Step 1: Add the `internalApiBaseUrl` field**

Replace the contents of `lib/config.ts` with:

```ts
const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
  internalApiBaseUrl:
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:3001',
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
};

export default config;
```

The fallback chain matters: `INTERNAL_API_BASE_URL` is preferred (Docker case), then `NEXT_PUBLIC_API_BASE_URL` (bare-metal — both contexts hit the same URL), then a hardcoded localhost default.

- [ ] **Step 2: Type-check by triggering a Next.js compile inside the running container**

```bash
docker compose exec nextjs sh -c 'touch app/page.tsx && head -1 app/page.tsx'
```

Watch the logs for compile errors:

```bash
docker compose logs --tail 30 nextjs
```

Expected: no TypeScript errors. The Next dev server picks up the change and recompiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "feat(api): add internalApiBaseUrl to config for SSR-side fetches"
```

---

## Task 11: Branch on `typeof window` inside `apiClient.request`

**Files:**
- Modify: `lib/api.ts`

The current file initializes `baseUrl` once at module load and uses `this.baseUrl` inside `request()`. Direct external references to `apiClient.baseUrl` were checked and there are none, so the field can be removed and the URL computed per-call instead.

- [ ] **Step 1: Replace the file with the dual-URL version**

Open `lib/api.ts` and replace its contents with:

```ts
import config from './config';

export const apiClient = {
  async request(endpoint: string, options: RequestInit = {}) {
    const baseUrl =
      typeof window === 'undefined'
        ? config.internalApiBaseUrl
        : config.apiBaseUrl;
    const url = `${baseUrl}${endpoint}`;

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    return fetch(url, { ...defaultOptions, ...options });
  },

  // Convenience methods
  get: (endpoint: string, options?: RequestInit) =>
    apiClient.request(endpoint, { ...options, method: 'GET' }),

  post: (endpoint: string, data?: any, options?: RequestInit) =>
    apiClient.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: (endpoint: string, data?: any, options?: RequestInit) =>
    apiClient.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: (endpoint: string, options?: RequestInit) =>
    apiClient.request(endpoint, { ...options, method: 'DELETE' }),
};

export default apiClient;
```

- [ ] **Step 2: Confirm no other code references `apiClient.baseUrl`**

```bash
grep -rn "apiClient\.baseUrl" --include="*.ts" --include="*.tsx" --include="*.js" .
```

Expected: empty output. If anything is found, replace those callsites with explicit calls to `config.apiBaseUrl` (browser-context only — server code shouldn't be reading `apiClient.baseUrl` directly).

- [ ] **Step 3: Watch the Next dev server for compile errors**

```bash
docker compose logs --tail 30 nextjs
```

Expected: clean compile, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add lib/api.ts
git commit -m "feat(api): branch apiClient base URL on typeof window for SSR vs browser"
```

---

## Task 12: Verify SSR fetch path uses Docker DNS

**Files:**
- (none — pure verification)

The point of Tasks 10–11 is that server-side `apiClient` calls hit `http://express:3001` while the browser hits `http://localhost:3001`. This task confirms it works end-to-end.

- [ ] **Step 1: Find a server component or route handler that uses `apiClient`**

```bash
grep -rln "from ['\"].*lib/api['\"]" --include="*.ts" --include="*.tsx" app/ components/ | head -5
```

Pick one of the files that imports apiClient — the home page (`app/page.tsx`) commonly does.

- [ ] **Step 2: Verify the home page renders without backend errors**

```bash
curl -s -o /tmp/home.html -w "HTTP %{http_code}\n" http://localhost:3000
grep -c "products\|category\|hero" /tmp/home.html
```

Expected: `HTTP 200`, and grep returns a non-zero count (page rendered with content from the API). If grep returns `0`, the SSR fetch silently failed — see Step 3.

- [ ] **Step 3: Tail Next logs while hitting the page**

```bash
docker compose logs -f nextjs &
TAIL_PID=$!
curl -s -o /dev/null http://localhost:3000
sleep 2
kill $TAIL_PID
```

Expected: no `ECONNREFUSED` or `fetch failed` errors. If you see `ECONNREFUSED localhost:3001`, the dual-URL branch isn't taking effect — re-read `lib/api.ts` and confirm Task 11 was saved into the running container (the bind mount should have picked it up).

- [ ] **Step 4: Verify the browser path also works**

Hit Express directly from the host (mimics what the browser does once hydrated):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/products
```

Expected: `200`.

- [ ] **Step 5: No commit** — this task is verification only.

---

## Task 13: Add Docker quickstart and troubleshooting to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a Docker section to the README**

```bash
cat >> README.md <<'EOF'

## Docker Development Stack

The full stack runs in Docker for local development — MySQL, Express, Next.js,
and an Adminer DB GUI.

### One-time setup

```bash
cp .env.docker.example .env.docker
# Edit .env.docker and replace REPLACE_WITH_A_LONG_RANDOM_STRING with:
#   openssl rand -base64 32

docker compose up -d --build
docker compose exec express npx prisma migrate dev --schema=/app/prisma/schema.prisma
```

After setup, the stack is reachable at:

- Next.js → http://localhost:3000
- Express → http://localhost:3001
- Adminer → http://localhost:8080 (server `mysql`, user `root`, pass `dockerpass`)

### Daily use

```bash
docker compose up -d                # start
docker compose logs -f nextjs       # tail one service
docker compose down                 # stop, keep DB volume
docker compose down -v              # full reset (drops mysql_data)
```

Code changes in `app/`, `components/`, `lib/`, or `server/` hot-reload via the
bind mount. Schema changes need:

```bash
docker compose exec express npx prisma migrate dev --name <change>
docker compose restart express nextjs
```

Adding a new dependency (`package.json` change) requires rebuilding the
service so the anonymous `node_modules` volume is regenerated:

```bash
docker compose up -d --build <nextjs|express>
```

### Troubleshooting

- **Express can't reach MySQL** — `docker compose ps` should show `mysql` as
  `healthy`. If it sticks at `unhealthy`, `docker compose logs mysql` will
  show why (commonly: host port 3306 collision).
- **Browser shows CORS error** — `FRONTEND_URL` in `.env.docker` must match
  the URL the browser is using.
- **Prisma client looks stale after schema change** — `docker compose restart
  express nextjs` regenerates the client on container start.
- **`linux-musl` engine error from Prisma** — only happens if someone swaps
  the base image to Alpine. Stay on `node:20-bookworm-slim` (the default in
  this repo) and the default binary targets work.
EOF
```

- [ ] **Step 2: Verify the README still parses**

Run: `head -5 README.md && tail -10 README.md`
Expected: head shows the original title, tail shows the troubleshooting bullets.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): add docker dev stack quickstart and troubleshooting"
```

---

## Task 14: Cold-boot integration test

**Files:**
- (none — pure verification)

This task simulates a fresh-clone experience to make sure the docs and files match reality.

- [ ] **Step 1: Tear everything down, including volumes**

```bash
docker compose down -v
docker volume ls | grep mysql_data
```

Expected: `docker volume ls` does *not* show `mysql_data` (it was dropped).

- [ ] **Step 2: Cold boot the stack**

```bash
docker compose up -d --build
```

Expected: builds (cached layers reused), then all four containers start. Wait until `docker compose ps` shows mysql as `healthy`:

```bash
until [ "$(docker inspect -f '{{.State.Health.Status}}' electronics-mysql 2>/dev/null)" = "healthy" ]; do
  sleep 2
done
echo "ready"
```

- [ ] **Step 3: Run migrations from cold**

```bash
docker compose exec express npx prisma migrate dev --schema=/app/prisma/schema.prisma
```

Expected: applies all migrations in `prisma/migrations/`, prints `Your database is now in sync with your schema.`

- [ ] **Step 4: Smoke-test all three URLs**

```bash
echo -n "nextjs: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
echo -n "express: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/products
echo -n "adminer: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080
```

Expected: all three print `200`.

- [ ] **Step 5: Verify hot reload works**

Touch a file and confirm Next picks it up.

```bash
docker compose logs -f nextjs &
TAIL_PID=$!
touch app/page.tsx
sleep 5
kill $TAIL_PID
```

Expected: log lines show a recompile triggered by the file change.

- [ ] **Step 6: Verify backend hot reload**

```bash
docker compose logs -f express &
TAIL_PID=$!
touch server/app.js
sleep 5
kill $TAIL_PID
```

Expected: log lines show `Server running on port 3001` again — Node `--watch` restarted the process.

- [ ] **Step 7: No commit** — this task is verification only. If any step failed, fix the underlying file (don't paper over it) and re-run from Step 2.

---

## Done

After Task 14 passes:
- The stack is bootable via `docker compose up -d --build` from a fresh clone.
- Hot reload works for both frontend and backend.
- DB persists across `docker compose down` (and is wiped only on `down -v`).
- The product-reviews implementation can resume — Task 1 of that plan (`npx prisma migrate dev --name add_review_model`) now has a runnable target.

Note any in-flight refinements (deviations from the spec discovered during implementation) into the **In-flight Refinements** section of `docs/superpowers/specs/2026-05-04-docker-dev-stack-decision.md` before declaring the work complete.
