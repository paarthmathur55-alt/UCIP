import asyncio
import json
import random
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, status, Header, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app import models, schemas
from app.security import (
    verify_password, create_access_token, get_current_user, require_admin,
)
from app.websocket_manager import manager
from app.dedup import check_and_update
from app.seed import seed_if_empty

def ensure_camera_registry_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("cameras"):
        Base.metadata.create_all(bind=engine)
        return

    columns = {col["name"] for col in inspector.get_columns("cameras")}
    needed_columns = {
        "camera_id": "VARCHAR",
        "department": "VARCHAR",
        "zone": "VARCHAR",
        "source_protocol": "VARCHAR",
        "stream_endpoint": "VARCHAR",
        "last_heartbeat_at": "DATETIME",
        "storage_path": "VARCHAR",
        "storage_retention_days": "INTEGER",
    }

    with engine.begin() as conn:
        for column_name, column_type in needed_columns.items():
            if column_name not in columns:
                conn.execute(text(f"ALTER TABLE cameras ADD COLUMN {column_name} {column_type}"))

        conn.execute(text("""
            UPDATE cameras
            SET
                camera_id = COALESCE(camera_id, ''),
                department = COALESCE(department, 'Operations'),
                zone = COALESCE(zone, ''),
                source_protocol = COALESCE(source_protocol, 'simulated'),
                stream_endpoint = COALESCE(stream_endpoint, ''),
                storage_path = COALESCE(storage_path, ''),
                storage_retention_days = COALESCE(storage_retention_days, 30)
            WHERE
                camera_id IS NULL
                OR department IS NULL
                OR zone IS NULL
                OR source_protocol IS NULL
                OR stream_endpoint IS NULL
                OR storage_path IS NULL
                OR storage_retention_days IS NULL
        """))

Base.metadata.create_all(bind=engine)
ensure_camera_registry_schema()

app = FastAPI(title="Unified Camera Intelligence Platform (UCIP)", version="0.1.0")

# Tracks per-camera health trend so degradation/recovery happen after repeated
# missed/healthy probes instead of random single flips.
_camera_health_state: dict[str, dict[str, int]] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db = next(get_db())
    seed_if_empty(db)
    db.close()
    # background camera "health checker" simulation
    asyncio.create_task(camera_health_simulator())


# =========================================================
# AUTH
# =========================================================
@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(subject=user.email, role=user.role)
    return schemas.TokenResponse(access_token=token, role=user.role, email=user.email)


@app.get("/auth/me", response_model=schemas.MeResponse)
def me(user: models.User = Depends(get_current_user)):
    return schemas.MeResponse(email=user.email, role=user.role)


# =========================================================
# CAMERAS
# =========================================================
@app.get("/cameras", response_model=List[schemas.CameraOut])
def list_cameras(
    search: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    zone: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Camera)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            models.Camera.name.ilike(f"%{search}%")
            | (models.Camera.address_label.ilike(f"%{search}%"))
            | (models.Camera.camera_id.ilike(f"%{search}%"))
            | (models.Camera.department.ilike(f"%{search}%"))
            | (models.Camera.zone.ilike(f"%{search}%"))
        )
    if status:
        q = q.filter(models.Camera.status == status)
    if department:
        q = q.filter(models.Camera.department == department)
    if zone:
        q = q.filter(models.Camera.zone == zone)
    return q.order_by(models.Camera.created_at.asc()).all()


@app.get("/cameras/{camera_id}", response_model=schemas.CameraOut)
def get_camera(camera_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    return cam


@app.post("/cameras", response_model=schemas.CameraOut, status_code=201)
def create_camera(body: schemas.CameraCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    cam = models.Camera(**body.model_dump())
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return cam


@app.put("/cameras/{camera_id}", response_model=schemas.CameraOut)
def update_camera(camera_id: str, body: schemas.CameraUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cam, field, value)
    if body.source_protocol:
        cam.protocol = body.source_protocol
    if body.stream_endpoint:
        cam.stream_url = body.stream_endpoint
    cam.updated_at = datetime.utcnow()
    if cam.last_heartbeat_at is None:
        cam.last_heartbeat_at = datetime.utcnow()
    db.commit()
    db.refresh(cam)
    return cam


@app.patch("/cameras/{camera_id}/status", response_model=schemas.CameraOut)
async def set_camera_status(camera_id: str, body: schemas.CameraStatusUpdate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    old_status = cam.status
    cam.status = body.status
    cam.last_heartbeat_at = datetime.utcnow()
    cam.updated_at = datetime.utcnow()
    db.add(models.CameraStatusLog(camera_id=cam.id, old_status=old_status, new_status=cam.status))
    db.commit()
    db.refresh(cam)
    await manager.broadcast("camera.status_changed", {
        "camera_id": cam.id, "name": cam.name, "old_status": old_status, "new_status": cam.status,
    })
    return cam


@app.post("/cameras/{camera_id}/heartbeat")
def heartbeat_camera(camera_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    cam.last_heartbeat_at = datetime.utcnow()
    if cam.status == "offline":
        cam.status = "online"
    cam.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "camera_id": cam.camera_id or cam.id, "last_heartbeat_at": cam.last_heartbeat_at}


@app.delete("/cameras/{camera_id}", status_code=204)
def disable_camera(camera_id: str, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    """Disable (soft-delete) rather than hard-delete, per admin workflow."""
    cam = db.query(models.Camera).filter(models.Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    cam.status = "offline"
    db.commit()
    return


# =========================================================
# EVENTS (ingest + query + tracking)
# =========================================================
@app.post("/events/ingest", response_model=Optional[schemas.EventOut], status_code=201)
async def ingest_event(
    body: schemas.EventIngest,
    db: Session = Depends(get_db),
    x_detector_key: str = Header(default=""),
):
    """
    Contract endpoint for the AI detector service (mock or, later, real).
    Protected by a shared secret header rather than user JWT, since this is
    called by a service, not a human.
    """
    if x_detector_key != settings.DETECTOR_SHARED_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid detector key")

    cam = db.query(models.Camera).filter(models.Camera.id == body.camera_id).first()
    if not cam:
        raise HTTPException(status_code=422, detail="Unknown camera_id")

    now = body.detected_at or datetime.utcnow()
    is_new = check_and_update(body.camera_id, body.entity_value, now)

    if not is_new:
        # duplicate sighting within the dedup window: bump last_seen_at only
        existing = (
            db.query(models.Event)
            .filter(models.Event.camera_id == body.camera_id, models.Event.entity_value == body.entity_value)
            .order_by(models.Event.detected_at.desc())
            .first()
        )
        if existing:
            existing.last_seen_at = now
            db.commit()
        return None

    event = models.Event(
        camera_id=body.camera_id,
        entity_type=body.entity_type,
        entity_value=body.entity_value,
        confidence=body.confidence,
        bounding_box=json.dumps(body.bounding_box),
        snapshot_url=body.snapshot_url,
        detected_at=now,
        last_seen_at=now,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    await manager.broadcast("event.created", {
        "id": event.id, "camera_id": event.camera_id, "camera_name": cam.name,
        "entity_type": event.entity_type, "entity_value": event.entity_value,
        "confidence": event.confidence, "detected_at": event.detected_at.isoformat(),
    })

    # watchlist match check (exact match, active entries only)
    match = (
        db.query(models.Watchlist)
        .filter(
            models.Watchlist.entity_value == event.entity_value,
            models.Watchlist.active == True,  # noqa: E712
        )
        .first()
    )
    if match:
        alert = models.Alert(
            event_id=event.id, watchlist_id=match.id, camera_id=cam.id, status="new",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        await manager.broadcast("alert.created", {
            "id": alert.id, "camera_id": cam.id, "camera_name": cam.name,
            "lat": cam.lat, "lng": cam.lng,
            "entity_type": event.entity_type, "entity_value": event.entity_value,
            "confidence": event.confidence, "reason": match.reason, "severity": match.severity,
            "created_at": alert.created_at.isoformat(),
        })

    return event


@app.get("/events", response_model=List[schemas.EventOut])
def list_events(
    camera_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_value: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Event)
    if camera_id:
        q = q.filter(models.Event.camera_id == camera_id)
    if entity_type:
        q = q.filter(models.Event.entity_type == entity_type)
    if entity_value:
        q = q.filter(models.Event.entity_value.ilike(f"%{entity_value}%"))
    return q.order_by(models.Event.detected_at.desc()).offset(offset).limit(limit).all()


@app.get("/events/track/{entity_value}", response_model=List[schemas.TrackPoint])
def track_entity(entity_value: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = (
        db.query(models.Event, models.Camera)
        .join(models.Camera, models.Camera.id == models.Event.camera_id)
        .filter(models.Event.entity_value == entity_value)
        .order_by(models.Event.detected_at.asc())
        .all()
    )
    return [
        schemas.TrackPoint(
            camera_id=cam.id, camera_name=cam.name, lat=cam.lat, lng=cam.lng,
            detected_at=ev.detected_at,
        )
        for ev, cam in rows
    ]


# =========================================================
# WATCHLIST
# =========================================================
@app.get("/watchlist", response_model=List[schemas.WatchlistOut])
def list_watchlist(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Watchlist).order_by(models.Watchlist.added_at.desc()).all()


@app.post("/watchlist", response_model=schemas.WatchlistOut, status_code=201)
def add_watchlist(body: schemas.WatchlistCreate, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    entry = models.Watchlist(**body.model_dump(), added_by=admin.email)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.patch("/watchlist/{entry_id}/deactivate", response_model=schemas.WatchlistOut)
def deactivate_watchlist(entry_id: str, db: Session = Depends(get_db), admin: models.User = Depends(require_admin)):
    entry = db.query(models.Watchlist).filter(models.Watchlist.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Watchlist entry not found")
    entry.active = False
    db.commit()
    db.refresh(entry)
    return entry


# =========================================================
# ALERTS
# =========================================================
def _alert_to_out(alert: models.Alert, db: Session) -> schemas.AlertOut:
    cam = db.query(models.Camera).filter(models.Camera.id == alert.camera_id).first()
    ev = db.query(models.Event).filter(models.Event.id == alert.event_id).first()
    wl = db.query(models.Watchlist).filter(models.Watchlist.id == alert.watchlist_id).first()
    out = schemas.AlertOut.model_validate(alert)
    out.camera_name = cam.name if cam else None
    out.entity_value = ev.entity_value if ev else None
    out.entity_type = ev.entity_type if ev else None
    out.confidence = ev.confidence if ev else None
    out.reason = wl.reason if wl else None
    out.severity = wl.severity if wl else None
    return out


@app.get("/alerts", response_model=List[schemas.AlertOut])
def list_alerts(status_filter: Optional[str] = Query(default=None, alias="status"), db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = db.query(models.Alert)
    if status_filter:
        q = q.filter(models.Alert.status == status_filter)
    alerts = q.order_by(models.Alert.created_at.desc()).limit(100).all()
    return [_alert_to_out(a, db) for a in alerts]


@app.patch("/alerts/{alert_id}/acknowledge", response_model=schemas.AlertOut)
async def acknowledge_alert(alert_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "acknowledged"
    alert.acknowledged_by = user.email
    alert.acknowledged_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    out = _alert_to_out(alert, db)
    await manager.broadcast("alert.updated", out.model_dump())
    return out


@app.patch("/alerts/{alert_id}/resolve", response_model=schemas.AlertOut)
async def resolve_alert(alert_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    db.commit()
    db.refresh(alert)
    out = _alert_to_out(alert, db)
    await manager.broadcast("alert.updated", out.model_dump())
    return out


# =========================================================
# DASHBOARD SUMMARY
# =========================================================
@app.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    total = db.query(models.Camera).count()
    online = db.query(models.Camera).filter(models.Camera.status == "online").count()
    offline = db.query(models.Camera).filter(models.Camera.status == "offline").count()
    degraded = db.query(models.Camera).filter(models.Camera.status == "degraded").count()
    new_alerts = db.query(models.Alert).filter(models.Alert.status == "new").count()
    total_events = db.query(models.Event).count()
    return {
        "cameras_total": total, "cameras_online": online, "cameras_offline": offline,
        "cameras_degraded": degraded, "alerts_new": new_alerts, "events_total": total_events,
    }


# =========================================================
# WEBSOCKET
# =========================================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # we don't expect inbound messages, but keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# =========================================================
# BACKGROUND: simulated camera health checker
# =========================================================
async def camera_health_simulator():
    """
    Simulated stream health probe. A camera only degrades after repeated missed
    checks, and it recovers only after several healthy checks. This mirrors the
    behavior of real CCTV/RTSP health monitoring more closely than a random
    single-state flip.
    """
    while True:
        await asyncio.sleep(10)
        db = next(get_db())
        try:
            cams = db.query(models.Camera).filter(models.Camera.status != "offline").all()
            for cam in cams:
                state = _camera_health_state.setdefault(cam.id, {"missed_frames": 0, "healthy_frames": 0})
                probe_ok = random.random() >= 0.30

                if cam.status == "online":
                    if probe_ok:
                        state["healthy_frames"] += 1
                        state["missed_frames"] = 0
                    else:
                        state["missed_frames"] += 1
                        state["healthy_frames"] = 0

                    if state["missed_frames"] >= 3:
                        old_status = cam.status
                        cam.status = "degraded"
                        db.add(models.CameraStatusLog(camera_id=cam.id, old_status=old_status, new_status=cam.status))
                        db.commit()
                        await manager.broadcast("camera.status_changed", {
                            "camera_id": cam.id, "name": cam.name,
                            "old_status": old_status, "new_status": cam.status,
                        })
                        state["missed_frames"] = 0

                elif cam.status == "degraded":
                    if probe_ok:
                        state["healthy_frames"] += 1
                        state["missed_frames"] = 0
                    else:
                        state["healthy_frames"] = 0
                        state["missed_frames"] += 1

                    if state["healthy_frames"] >= 2:
                        old_status = cam.status
                        cam.status = "online"
                        db.add(models.CameraStatusLog(camera_id=cam.id, old_status=old_status, new_status=cam.status))
                        db.commit()
                        await manager.broadcast("camera.status_changed", {
                            "camera_id": cam.id, "name": cam.name,
                            "old_status": old_status, "new_status": cam.status,
                        })
                        state["healthy_frames"] = 0
        finally:
            db.close()
