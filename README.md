# UCIP — Unified Camera Intelligence Platform (Prototype)

A working prototype of a CCTV registry + AI-detection + watchlist-alerting
platform: camera registry with a GIS map, a unified operator dashboard,
real-time WebSocket alerts, and movement tracking across cameras.

## Review Handoff

This repository is prepared for review and includes the supporting design docs and
handoff notes below:

- Architecture overview: [docs/ARCHITECTURE_AND_WORKFLOW.md](docs/ARCHITECTURE_AND_WORKFLOW.md)
- Scalability and security notes: [docs/SCALABILITY_AND_SECURITY.md](docs/SCALABILITY_AND_SECURITY.md)
- Project review summary: [docs/REVIEW_HANDOFF.md](docs/REVIEW_HANDOFF.md)

### Demo credentials (local demo only)

These are demo credentials for the seeded application users and are safe for
review/testing in a local environment only. They are not production credentials.

- Operator: `operator@demo.local` / `Operator@12345`
- Admin: `admin@demo.local` / `Admin@12345`

### Short note on completed work

Completed work includes:
- FastAPI backend with SQLite persistence, JWT auth, role-based access control,
  camera registry APIs, event ingest workflow, watchlist matching, alerting,
  and WebSocket updates.
- React + Vite dashboard with live feed tiles, map view, alert panel, event
  feed, track/search, and camera/watchlist management.
- Synthetic detector service that emits live detections to simulate real-time AI
  input without requiring a full production ML stack.
- Architecture and scalability documentation for the prototype and future
  production upgrade path.

### Limitations and planned improvements

Limitations:
- The prototype uses SQLite and in-process WebSocket broadcasting instead of
  Redis/Postgres/Kafka to keep setup simple and local.
- The detector is synthetic and simulates detections rather than using a real
  model pipeline.
- Video playback is simulated in the frontend rather than ingesting real RTSP
  streams.

Improvements with more time:
- Replace the prototype storage and message bus with production-ready services
  and add migrations.
- Add real RTSP/stream ingestion, edge detection services, and a real model
  integration layer.
- Strengthen security with rate limiting, refresh tokens, audit logging, and
  stricter deployment hardening.
- Add automated tests for auth, camera CRUD, alert workflows, and RBAC.

> Important: no passwords, private keys, API keys, or production credentials
> were committed to this repository.

Everything runs as **plain local processes** — no Docker, no Postgres/Redis
server to install. The backend uses SQLite (a single file, zero setup) and
an in-process WebSocket broadcaster instead of Redis.

> This is a demo/prototype. See "What's simulated" below for exactly what's
> real vs. simulated, and `docs/SCALABILITY_AND_SECURITY.md` for how it
> would change for a production, 80,000-camera deployment.

---

## 1. What you get

- **Backend** (`/backend`) — FastAPI + SQLite. Auth (JWT, admin/operator
  roles), camera registry, event ingestion with deduplication, watchlist
  matching, alerts, movement tracking, WebSocket push.
- **Detector** (`/detector`) — a standalone script that emits synthetic
  ANPR/person-detection events on a timer, in the exact JSON shape a real
  detector would use. This is the file you'd replace to plug in a real
  model later — nothing else changes.
- **Frontend** (`/frontend`) — React + Vite dashboard: simulated live video
  tiles, Leaflet map with camera markers and movement-tracking polylines,
  real-time alerts panel, event feed, search/track, camera & watchlist
  admin pages.

## 2. What's simulated (and why)

| Feature | This build | Why |
|---|---|---|
| Camera video | Animated canvas placeholder per camera tile | Real RTSP→browser video needs external native binaries (ffmpeg + a media server like MediaMTX) installed on your machine — out of scope for a Docker-free, dependency-light build. Swap-in point documented in `frontend/src/components/VideoTile.jsx`. |
| AI detection (ANPR / person) | `detector/detector.py` posts synthetic events | No model training was requested; this keeps the exact same wire contract a real detector would use, documented in `docs/ARCHITECTURE_AND_WORKFLOW.md` §4. |
| Real-time bus | In-process WebSocket broadcast (no Redis) | Redis needs a separate server to install without Docker. Fine for one backend instance; documented scale-up path in `docs/SCALABILITY_AND_SECURITY.md`. |
| Database | SQLite file | Zero setup, no server to install. Swap to Postgres by changing `DATABASE_URL` and the SQLAlchemy dialect. |

Everything else — auth, RBAC, camera CRUD, event ingestion, deduplication,
watchlist matching, alerting, acknowledge/resolve, tracking, the dashboard —
is fully real and working, not mocked in the UI.

## 3. Prerequisites

- Python 3.10+ 
- Node.js 18+ and npm
- Three terminal windows (backend, frontend, detector)

## 4. Setup & Run

### Terminal 1 — Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # defaults are fine for local use
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
This creates `ucip.db` (SQLite) on first run and seeds it with:
- Admin: `admin@demo.local` / `Admin@12345`
- Operator: `operator@demo.local` / `Operator@12345`
- 2 cameras, 5 watchlist entries

API docs: http://127.0.0.1:8000/docs

### Terminal 2 — Frontend
```bash
cd frontend
npm install
cp .env.example .env              # points the UI at http://127.0.0.1:8000
npm run dev
```
Open http://127.0.0.1:5173 and log in with either demo account above.

### Terminal 3 — Detector (optional but recommended)
```bash
cd detector
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python detector.py
```
Within a few seconds you'll see live detections and, occasionally, an
alert (it's seeded to sometimes emit values that match the watchlist)
appear on the dashboard in real time — no page refresh needed.

## 5. Demo flow to try

1. Log in as **operator**.
2. Watch the live feed tiles — each camera has its own animated indicator
   and shows the last detection under it.
3. Wait for an alert to appear in the right-hand panel (or watch the
   detector's terminal output — lines matching a seeded watchlist value
   will fire one within ~30–60 seconds).
4. Click **Acknowledge**, then **Resolve** on the alert — status updates
   instantly.
5. Type a plate like `DL8CAF1234` into the search bar and hit **Track** —
   the map draws the route between the cameras that saw it, in order.
6. Log out, log in as **admin**, go to **Cameras** or **Watchlist** to add
   new entries.

## 6. Project layout

```
backend/
  app/
    main.py            # all routes + WebSocket + background health simulator
    models.py           # SQLAlchemy models
    schemas.py           # Pydantic request/response schemas
    security.py         # JWT + password hashing + role guards
    dedup.py             # in-memory sighting dedup (documented Redis swap)
    websocket_manager.py # in-process WS fan-out (documented Redis swap)
    seed.py              # demo users/cameras/watchlist
  requirements.txt
  .env.example

detector/
  detector.py            # mock AI detector — the real-model swap-in point
  requirements.txt
  .env.example

frontend/
  src/
    pages/               # Login, Dashboard, Cameras, Watchlist
    components/          # VideoTile, MapView, AlertsPanel, EventFeed, SearchBar
    hooks/useWebSocket.js
    api.js                # typed fetch wrapper
    auth.jsx              # React auth context
  package.json

docs/
  ARCHITECTURE_AND_WORKFLOW.md   # diagrams, schema, event lifecycle
  SCALABILITY_AND_SECURITY.md    # scaling to 80,000 cameras, security controls
```

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend shows "reconnecting…" forever | Backend isn't running, or `VITE_API_BASE_URL` in `frontend/.env` doesn't match the backend's actual host/port |
| CORS error in browser console | Add your frontend's exact origin to `CORS_ORIGINS` in `backend/.env` |
| Login fails with seeded accounts | Delete `backend/ucip.db` and restart the backend to force reseeding |
| No alerts ever appear | Give the detector 30–90 seconds — it fires on ~25% of detections by default (`DETECTOR_WATCHLIST_HIT_PROBABILITY`) |
| `ModuleNotFoundError` on backend start | You're not inside the activated `venv` — re-run `source venv/bin/activate` |

## 8. Resetting the demo
```bash
rm backend/ucip.db     # backend will reseed on next start
```
