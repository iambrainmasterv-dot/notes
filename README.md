# NoteTasks

Notes and tasks app with daily schedules, templates, presets, and user accounts.  
React + TypeScript + Vite frontend, Express + Postgres backend.

## Architecture

- **Frontend** (`/src`): React SPA built with Vite. Communicates with the API via `fetch`.
- **Backend** (`/server`): Express.js API with JWT auth, bcrypt password hashing, and Postgres storage.
- **Docker**: Single container — Express serves both the API and the built static frontend.

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL (running locally or via Docker)

### 1. Set up the database

```bash
createdb notesapp
```

### 2. Start the backend

```bash
cd server
cp .env.example .env   # edit DATABASE_URL and JWT_SECRET
npm install
npm run dev             # runs on port 3001
```

### 3. Start the frontend

```bash
npm install
npm run dev             # runs on port 5173, proxies /api to :3001
```

Open http://localhost:5173 — sign up, and you're in.

## Deploy on Railway

1. Push this repo to **GitHub**.
2. Go to [railway.app](https://railway.app) → **New Project**.
3. Add a **Postgres** service (Railway provides a free Postgres instance).
4. Add a **service from GitHub** → select this repo.
5. In the service **Variables**, set:
   - `DATABASE_URL` → copy from the Postgres service's connection string
   - `JWT_SECRET` → a random string (e.g. `openssl rand -hex 32`)
6. In **Settings** → **Networking** → **Generate Domain** to get a public URL.

The Dockerfile handles everything — it builds the frontend, bundles it with the Express server, and serves both on port 80.
