from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


class MeResponse(BaseModel):
    email: str
    role: str


# ---------- Cameras ----------
class CameraCreate(BaseModel):
    camera_id: Optional[str] = ""
    name: str
    department: str = "Operations"
    lat: float
    lng: float
    address_label: str = ""
    zone: str = ""
    type: str = "fixed"
    stream_url: str = ""
    stream_endpoint: str = ""
    source_protocol: str = "simulated"
    protocol: str = "simulated"
    storage_path: str = ""
    storage_retention_days: int = 30
    status: str = "online"


class CameraUpdate(BaseModel):
    camera_id: Optional[str] = None
    name: Optional[str] = None
    department: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address_label: Optional[str] = None
    zone: Optional[str] = None
    type: Optional[str] = None
    stream_url: Optional[str] = None
    stream_endpoint: Optional[str] = None
    source_protocol: Optional[str] = None
    protocol: Optional[str] = None
    storage_path: Optional[str] = None
    storage_retention_days: Optional[int] = None
    status: Optional[str] = None


class CameraStatusUpdate(BaseModel):
    status: str  # online | offline | degraded


class CameraOut(BaseModel):
    id: str
    camera_id: str
    name: str
    department: str
    lat: float
    lng: float
    address_label: str
    zone: str
    type: str
    stream_url: str
    stream_endpoint: str
    source_protocol: str
    protocol: str
    storage_path: str
    storage_retention_days: int
    status: str
    last_heartbeat_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------- Events ----------
class EventIngest(BaseModel):
    camera_id: str
    entity_type: str = Field(pattern="^(vehicle_plate|person)$")
    entity_value: str
    confidence: float = 0.9
    bounding_box: dict = {}
    snapshot_url: str = ""
    detected_at: Optional[datetime] = None


class EventOut(BaseModel):
    id: str
    camera_id: str
    entity_type: str
    entity_value: str
    confidence: float
    detected_at: datetime
    last_seen_at: datetime

    class Config:
        from_attributes = True


class TrackPoint(BaseModel):
    camera_id: str
    camera_name: str
    lat: float
    lng: float
    detected_at: datetime


# ---------- Watchlist ----------
class WatchlistCreate(BaseModel):
    entity_type: str = Field(pattern="^(vehicle_plate|person)$")
    entity_value: str
    reason: str = ""
    severity: str = "medium"


class WatchlistOut(BaseModel):
    id: str
    entity_type: str
    entity_value: str
    reason: str
    severity: str
    active: bool
    added_by: str
    added_at: datetime

    class Config:
        from_attributes = True


# ---------- Alerts ----------
class AlertOut(BaseModel):
    id: str
    event_id: str
    watchlist_id: str
    camera_id: str
    status: str
    acknowledged_by: str
    acknowledged_at: Optional[datetime]
    created_at: datetime
    # denormalized convenience fields for the dashboard
    camera_name: Optional[str] = None
    entity_value: Optional[str] = None
    entity_type: Optional[str] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None
    severity: Optional[str] = None

    class Config:
        from_attributes = True
