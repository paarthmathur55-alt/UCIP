# ARCHITECTURE & WORKFLOW — Unified Camera Intelligence Platform

> **Note on this copy:** This document describes the target architecture
> (including Redis/Kafka as the real-time bus). The actual code in this
> repo is a Docker-free prototype that uses SQLite instead of Postgres and
> an in-process WebSocket broadcaster instead of Redis — see the root
> `README.md` for exactly what's real vs. simplified in this build, and the
> "SWAP-IN POINT" comments in `backend/app/dedup.py` and
> `backend/app/websocket_manager.py` for how to upgrade to the design below.

## 1. High-Level Component Diagram

```mermaid
flowchart LR
    subgraph Cameras
        C1[Real/Simulated Camera 1 - RTSP]
        C2[Real/Simulated Camera 2 - RTSP]
    end

    subgraph VideoBridge [MediaMTX]
        direction TB
        VB[RTSP in -> HLS/WebRTC out]
    end

    subgraph Detector [Mock Detector Service]
        D1[Emits synthetic ANPR/person events]
    end

    subgraph Backend [FastAPI Backend]
        API[REST API]
        WS[WebSocket Gateway]
        ING[Event Ingest + Dedup + Watchlist Match]
    end

    subgraph Data
        PG[(PostgreSQL)]
        RD[(Redis: cache, pub/sub, dedup keys)]
    end

    subgraph Frontend [React Dashboard]
        UI[Video tiles, Map, Alerts, Search]
    end

    C1 --> VB
    C2 --> VB
    VB --> UI
    D1 -->|POST /events/ingest| ING
    ING --> PG
    ING --> RD
    RD --> WS
    WS --> UI
    UI -->|REST calls| API
    API --> PG
```

## 2. Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ CAMERAS : "manages"
    CAMERAS ||--o{ EVENTS : "produces"
    CAMERAS ||--o{ CAMERA_STATUS_LOG : "has"
    EVENTS ||--o| ALERTS : "may trigger"
    WATCHLIST ||--o{ ALERTS : "matched by"
    USERS ||--o{ ALERTS : "acknowledges"

    USERS {
        uuid id PK
        string email
        string password_hash
        string role "admin|operator"
        datetime created_at
    }
    CAMERAS {
        string id PK
        string name
        float lat
        float lng
        string address_label
        string type "fixed|ptz"
        string stream_url
        string protocol "rtsp|onvif|hls"
        string status "online|offline|degraded"
        datetime created_at
        datetime updated_at
    }
    CAMERA_STATUS_LOG {
        uuid id PK
        string camera_id FK
        string old_status
        string new_status
        datetime changed_at
    }
    EVENTS {
        uuid id PK
        string camera_id FK
        string entity_type "vehicle_plate|person"
        string entity_value
        float confidence
        jsonb bounding_box
        string snapshot_url
        datetime detected_at
        datetime last_seen_at
    }
    WATCHLIST {
        uuid id PK
        string entity_type
        string entity_value
        string reason
        string severity "low|medium|high"
        boolean active
        string added_by FK
        datetime added_at
    }
    ALERTS {
        uuid id PK
        uuid event_id FK
        uuid watchlist_id FK
        string camera_id FK
        string status "new|acknowledged|resolved"
        string acknowledged_by FK
        datetime acknowledged_at
        datetime created_at
    }
```

## 3. Event Lifecycle (Sequence)

```mermaid
sequenceDiagram
    participant Det as Detector Service
    participant API as Backend API
    participant Redis
    participant DB as PostgreSQL
    participant WS as WebSocket Gateway
    participant UI as Dashboard

    Det->>API: POST /events/ingest {camera_id, entity_value, ...}
    API->>API: Validate payload schema
    API->>Redis: Check dedup key (camera_id+entity_value)
    alt duplicate within window
        API->>DB: UPDATE events.last_seen_at
    else new sighting
        API->>DB: INSERT event
        API->>DB: Query active watchlist for match
        alt match found
            API->>DB: INSERT alert (status=new)
            API->>Redis: PUBLISH alert.created
        end
        API->>Redis: PUBLISH event.created
    end
    Redis-->>WS: fan-out message
    WS-->>UI: push over WebSocket
    UI->>UI: update live feed / alert panel instantly
```

## 4. Where a Real AI Model Plugs In

The mock `detector-service` is the **only** component a real ANPR/person
detection model replaces. It must keep POSTing the exact same JSON contract
(Section 4.5 of `PROJECT_PROMPT.md`) to `/events/ingest`. Nothing downstream
(backend validation, dedup, watchlist matching, alerting, dashboard) needs to
change. This boundary is what keeps "no model training" honest while still
producing a realistic, wire-compatible system.

## 5. Deduplication Logic (detail)

1. On each incoming event, compute key `dedup:{camera_id}:{entity_value}`.
2. If the key exists in Redis (TTL = dedup window, default 30s):
   - Update the existing `events.last_seen_at` in Postgres.
   - Do **not** insert a new event row.
   - Do **not** create a new alert if one is already `new` or
     `acknowledged` for that event.
   - Refresh the Redis key's TTL (sliding window).
3. If the key does not exist:
   - Insert a new `events` row.
   - Set the Redis key with the TTL.
   - Proceed to watchlist matching as normal.

## 6. Movement Tracking Query

Given an `entity_value` (e.g., a plate number), movement tracking is simply:

```sql
SELECT e.detected_at, c.name, c.lat, c.lng
FROM events e
JOIN cameras c ON c.id = e.camera_id
WHERE e.entity_value = :value
ORDER BY e.detected_at ASC;
```

The frontend draws a polyline through the resulting `(lat, lng)` points in
order and drops a timestamped marker at each stop. No separate "tracking
engine" is needed at this scale — see `SCALABILITY_AND_SECURITY.md` for how
this changes at 80,000 cameras.

## 7. Folder Structure

```
/backend
  /app
    /api          # route modules: cameras, events, alerts, watchlist, auth
    /core         # config, security, websocket manager
    /models       # SQLAlchemy models
    /schemas      # Pydantic schemas
    /services     # dedup, watchlist matching, health-checker
  /migrations     # Alembic
  /tests
/frontend
  /src
    /components   # VideoTile, MapView, AlertPanel, SearchBar, EventTable
    /hooks        # useWebSocket, useCameras, useAlerts
    /pages        # Dashboard, CameraRegistry, Login
/camera-simulator
  docker-compose fragment + ffmpeg configs for 2 synthetic streams
/detector-service
  main.py         # emits synthetic events on an interval
/docs
  diagrams, ER exports
docker-compose.yml
README.md
```
