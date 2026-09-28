import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="operator")  # admin | operator
    created_at = Column(DateTime, default=datetime.utcnow)


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, default=gen_uuid)
    camera_id = Column(String, unique=True, index=True, default="")
    name = Column(String, nullable=False)
    department = Column(String, default="Operations")
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    address_label = Column(String, default="")
    zone = Column(String, default="")
    type = Column(String, default="fixed")  # fixed | ptz
    source_protocol = Column(String, default="simulated")  # rtsp | onvif | hls | webrtc | simulated
    stream_endpoint = Column(String, default="")
    stream_url = Column(String, default="")
    protocol = Column(String, default="simulated")  # legacy alias kept for compatibility
    status = Column(String, default="online")  # online | offline | degraded
    last_heartbeat_at = Column(DateTime, default=datetime.utcnow)
    storage_path = Column(String, default="")
    storage_retention_days = Column(Integer, default=30)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    events = relationship("Event", back_populates="camera")


class CameraStatusLog(Base):
    __tablename__ = "camera_status_log"

    id = Column(String, primary_key=True, default=gen_uuid)
    camera_id = Column(String, ForeignKey("cameras.id"))
    old_status = Column(String)
    new_status = Column(String)
    changed_at = Column(DateTime, default=datetime.utcnow)


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=gen_uuid)
    camera_id = Column(String, ForeignKey("cameras.id"))
    entity_type = Column(String, nullable=False)  # vehicle_plate | person
    entity_value = Column(String, nullable=False, index=True)
    confidence = Column(Float, default=0.0)
    bounding_box = Column(Text, default="{}")  # JSON string
    snapshot_url = Column(String, default="")
    detected_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="events")


class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(String, primary_key=True, default=gen_uuid)
    entity_type = Column(String, nullable=False)
    entity_value = Column(String, nullable=False, index=True)
    reason = Column(String, default="")
    severity = Column(String, default="medium")  # low | medium | high
    active = Column(Boolean, default=True)
    added_by = Column(String, default="")
    added_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=gen_uuid)
    event_id = Column(String, ForeignKey("events.id"))
    watchlist_id = Column(String, ForeignKey("watchlist.id"))
    camera_id = Column(String, ForeignKey("cameras.id"))
    status = Column(String, default="new")  # new | acknowledged | resolved
    acknowledged_by = Column(String, default="")
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
