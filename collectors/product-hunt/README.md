# Signal — Product Hunt Collector

Standalone Node.js service that fetches new Product Hunt launches (posts,
makers, comments, votes, topics) and pushes normalized rows into the shared
`raw_events` table of the Signal AI Opportunity Intelligence Platform.

> This service is **not** part of the Lovable app. It is designed to run on
> an external Ubuntu VPS (Docker) and talk to the database over HTTPS using
> the service role key.

## Architecture

```
Product Hunt GraphQL v2
        │
        ▼
  Fetch → Normalize → Deduplicate (dedupe_hash) → Upsert into raw_events
        │
        └── writes to `collectors`, `collector_logs`
```

Reused by future collectors (GitHub, Hacker News, YouTube, Discord…) —
copy the folder, replace `src/producthunt.js` + `src/normalize.js`, keep
everything else.

## HTTP interface

| Method | Path                | Purpose                          |
| ------ | ------------------- | -------------------------------- |
| GET    | `/health`           | Liveness probe                   |
| GET    | `/status`           | Collector row + runtime stats    |
| POST   | `/collector/start`  | Start polling loop               |
| POST   | `/collector/stop`   | Stop polling loop (graceful)     |
| POST   | `/collector/test`   | Fetch ONE post, normalize, insert into `raw_events`, return diagnostics. Does NOT trigger the AI pipeline. |

## Configuration

All configuration is via environment variables. See `.env.example`.

Required:

- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-only)
- `PRODUCT_HUNT_TOKEN` — developer token from
  <https://api.producthunt.com/v2/oauth/applications>

Optional (with sensible defaults):

- `COLLECTOR_ID` — bind to an existing `collectors` row; otherwise the
  service auto-provisions/looks up by `COLLECTOR_NAME` + `COLLECTOR_PLATFORM`.
- `POLL_INTERVAL_SECONDS` (default `900`)
- `POSTS_PER_RUN` (default `40`)
- `COMMENTS_PER_POST` (default `50`)
- `AUTOSTART` (default `true`)
- `MAX_RETRIES`, `RETRY_BASE_MS` — exponential backoff on transient errors
- `PORT` (default `8080`)
- `LOG_LEVEL` (default `info`)

Runtime overrides can also be stored on the collector row itself in
`collectors.config` (e.g. `poll_interval_seconds`, checkpoint state under
`config.checkpoint`).

## Local development

```bash
cp .env.example .env
# edit .env
npm install
npm start
curl localhost:8080/health
curl localhost:8080/status
```

## Deploy on a Ubuntu VPS with Docker

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Copy this folder to the VPS
scp -r collectors/product-hunt user@vps:/opt/signal-producthunt

# 3. Configure
cd /opt/signal-producthunt
cp .env.example .env
nano .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRODUCT_HUNT_TOKEN

# 4. Build + run
docker compose up -d --build

# 5. Verify
curl http://localhost:8080/health
curl http://localhost:8080/status
docker compose logs -f
```

The container restarts automatically (`restart: unless-stopped`) and ships
with a `HEALTHCHECK` so Docker/Watchtower/systemd can detect crashes.

### Optional: put it behind Caddy / nginx

Expose only `/health` and `/status` publicly; keep `/collector/start` and
`/collector/stop` on the private network or behind basic auth. Nothing in
this service needs public ingress — the collector calls out to Product Hunt
and Supabase, not the other way around.

## How it integrates with the dashboard

- On first boot the service ensures a row exists in `collectors` (or uses
  `COLLECTOR_ID`). Toggle `enabled` from the Signal admin dashboard to pause
  the collector remotely — the next run will refuse to start.
- Every run writes a structured entry to `collector_logs` (`info`, `warn`,
  `error`) that appears in the dashboard's Logs page.
- Normalized events land in `raw_events` with:
  - `platform = 'producthunt'`
  - `external_id = 'post:<id>'` or `'comment:<id>'`
  - `dedupe_hash = sha256(platform | external_id)` (upsert on conflict)
  - `metadata.kind`, `metadata.makers`, `metadata.topics`,
    `metadata.votes_count`, `metadata.comments_count`, `metadata.hunter`, …
- The existing AI pipeline picks up unprocessed rows — no dashboard changes
  required.

## Incremental sync

The collector stores its checkpoint in `collectors.config.checkpoint`:

```json
{
  "last_post_created_at": "2026-07-19T10:22:00Z",
  "last_comment_created_at": "2026-07-19T10:24:11Z",
  "last_run_at": "2026-07-19T10:24:30Z"
}
```

On each run it only asks Product Hunt for posts newer than the checkpoint,
and stops paging comments once it reaches previously-seen ones.

## Reliability

- Exponential backoff with jitter on 5xx / 429 (`MAX_RETRIES`, `RETRY_BASE_MS`)
- 4xx errors (bad token, invalid query) fail fast — surfaced in
  `collector_logs` and `collectors.last_error`
- Graceful shutdown on `SIGTERM` / `SIGINT`: current run finishes, HTTP
  server drains, then exits within 10s
- Structured JSON logging via `pino` — pipe into Loki, Datadog, etc.
- Duplicate-safe: `raw_events.dedupe_hash` upsert with `ignoreDuplicates`

## Adding another collector later

1. Copy this directory to `collectors/<platform>/`
2. Replace `src/producthunt.js` with the new API client
3. Replace `src/normalize.js` with platform-specific mapping to `raw_events`
4. Update `COLLECTOR_PLATFORM`, `COLLECTOR_NAME`, and `.env.example`

Everything else — the polling loop, retries, checkpoints, HTTP surface,
logging, graceful shutdown, Dockerfile — stays the same.
