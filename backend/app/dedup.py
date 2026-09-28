"""
In-memory sighting dedup, keyed by (camera_id, entity_value).

NOTE ON SCALING: this dict lives in one process's memory, which works for a
single backend instance. At scale, replace this with a Redis key
(SETEX camera_id:entity_value <window>) shared across all backend instances,
so dedup still works correctly behind a load balancer. See
SCALABILITY_AND_SECURITY.md.
"""
from datetime import datetime, timedelta
from typing import Optional

from app.config import settings

_last_seen: dict[tuple[str, str], datetime] = {}


def check_and_update(camera_id: str, entity_value: str, now: Optional[datetime] = None) -> bool:
    """
    Returns True if this is a NEW sighting (insert a new event row).
    Returns False if this is a duplicate within the dedup window
    (caller should just bump last_seen_at on the existing event).
    """
    now = now or datetime.utcnow()
    key = (camera_id, entity_value)
    prev = _last_seen.get(key)
    window = timedelta(seconds=settings.EVENT_DEDUP_WINDOW_SECONDS)
    _last_seen[key] = now
    if prev is not None and (now - prev) <= window:
        return False
    return True
