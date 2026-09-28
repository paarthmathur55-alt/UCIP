# SCALABILITY & SECURITY — Unified Camera Intelligence Platform

> **Note:** This describes how the design scales to 80,000 cameras and the
> security controls expected in production. The runnable prototype in this
> repo implements the security basics (bcrypt, JWT, role guards, input
> validation, detector shared key, CORS allow-list) and documents swap-in
> points for the scale-up pieces (Redis/Kafka, Postgres, edge GPU detection).


## 1. Scaling from a 2-Camera Prototype to 80,000 Cameras

### 1.1 Video Ingestion
- **Prototype:** one MediaMTX instance bridges all streams.
- **At scale:** shard cameras across a **fleet of MediaMTX/edge-transcoder
  nodes** (e.g., 500–1,000 cameras per node), placed regionally near the
  camera networks to avoid backhauling raw RTSP over long distances.
  A lightweight assignment service tracks which node owns which camera.

### 1.2 Detection Pipeline
- **Prototype:** one mock detector service.
- **At scale:** detection must run on **edge GPU boxes near the cameras**
  (or at regional aggregation points) rather than centrally, because
  streaming 80,000 raw video feeds to one datacenter is bandwidth-infeasible.
  Only the **structured detection events** (JSON, kilobytes) travel to the
  central platform — never raw video, except on-demand snapshot/clip pulls
  for alert review.
- GPU sizing: budget roughly 1 modern inference GPU per ~30–60
  concurrent 1080p streams for a lightweight ANPR/person model (this varies
  by model and frame rate; benchmark before committing capacity).

### 1.3 Event Ingestion & Messaging
- **Prototype:** Redis Pub/Sub is enough below ~1,000 cameras.
- **At scale:** replace with **Kafka** (or Redis Streams with consumer
  groups if staying simpler) for:
  - Durability (events aren't lost if a consumer is briefly down)
  - Replay (reprocess events if a matching rule changes)
  - Multiple independent consumers (watchlist matcher, analytics
    aggregator, long-term archival, all reading the same stream)
- Partition Kafka topics by camera-region or camera-id hash so no single
  partition becomes a bottleneck.

### 1.4 Database
- **Prototype:** single Postgres instance.
- **At scale:**
  - Partition the `events` table by time (e.g., daily/weekly partitions)
    since it is by far the highest-write-volume table.
  - Read replicas for dashboard/search queries so ingestion writes never
    contend with operator reads.
  - Consider a time-series-optimized store (TimescaleDB extension on
    Postgres, or a dedicated store) once event volume passes tens of
    millions of rows/day.
  - Move cold event data (>90 days, configurable) to cheaper archival
    storage (object storage + periodic export), keeping hot storage lean.

### 1.5 Watchlist Matching
- Exact-match lookups scale fine with an indexed table or a Redis
  in-memory set of active watchlist values, refreshed on any watchlist
  change (cache-aside pattern) — this avoids a DB hit on every single
  detection event.
- At very high entity-cardinality, keep the "active watchlist" set fully in
  Redis/memory across all matcher instances so matching stays O(1) per
  event regardless of camera count.

### 1.6 Caching & Load Balancing
- Stateless backend instances behind a load balancer (e.g., Nginx/HAProxy
  or a cloud LB), horizontally scaled based on ingestion + WebSocket
  connection count.
- CDN/edge caching for static frontend assets.
- Redis (or a managed equivalent) for session/token blacklists and the
  watchlist cache described above.

### 1.7 Disaster Recovery
- Automated Postgres backups (point-in-time recovery) with a documented
  RPO/RTO target (e.g., RPO 15 min, RTO 1 hour, tune to actual
  requirements).
- Multi-AZ (or multi-datacenter) deployment for the core platform;
  regional edge nodes (1.1/1.2) can degrade independently without taking
  down the whole system — a region losing connectivity should only affect
  its own cameras, not the global dashboard.
- Regular failover drills; Kafka replication factor ≥3 in production.

## 2. Security Controls (mandatory even in the prototype)

| Control | Prototype requirement | Notes |
|---|---|---|
| Password storage | bcrypt/argon2 hashed, never plaintext | Enforced via `passlib` |
| Auth tokens | JWT access + refresh, short-lived access token | Refresh rotation recommended |
| Role-based access | `admin` vs `operator` route guards on every sensitive endpoint | Verified by an automated test (Section 7 of `PROJECT_PROMPT.md`) |
| Transport security | HTTPS-ready reverse proxy config (TLS termination at Nginx/Caddy) | Self-signed cert fine for local demo |
| Input validation | Every request body validated via Pydantic schemas, reject on mismatch (422) | Includes the detector's `/events/ingest` payload |
| Audit logging | Every alert acknowledge/resolve and camera add/edit/disable is logged with actor + timestamp | Needed for any real deployment's accountability requirements |
| Secrets management | All secrets via `.env`/environment, never committed to source control | `.env.example` only in the repo |
| Rate limiting | Basic rate limit on auth endpoints (login) to slow brute-force attempts | e.g., `slowapi` middleware |
| CORS | Explicit allow-list of frontend origin(s), not `*` | Tightened further in production |

## 3. What Changes at Production Scale (Security)

- Centralized identity provider (SSO/OIDC) instead of local JWT auth,
  especially for multi-agency/multi-department deployments.
- Network segmentation: camera network isolated from the corporate/internet
  network, with the edge detector boxes as the only bridge.
- Formal data retention policy for video/snapshots (legal requirement in
  most jurisdictions for CCTV data) — how long footage and detection
  events are kept, and secure deletion after that window.
- Penetration testing and a documented incident-response process before
  any real deployment goes live.
