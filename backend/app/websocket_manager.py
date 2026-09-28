import json
from typing import List

from fastapi import WebSocket


class ConnectionManager:
    """
    In-process fan-out for real-time push (event.created, alert.created,
    alert.updated, camera.status_changed).

    NOTE ON SCALING: this holds connections in local process memory, which is
    fine for a single backend instance. At scale, replace this class's
    broadcast() with a publish to Redis Pub/Sub or Kafka, and have every
    backend instance subscribe and forward to its own local WebSocket
    connections. See SCALABILITY_AND_SECURITY.md.
    """

    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message_type: str, payload: dict):
        data = json.dumps({"type": message_type, "payload": payload}, default=str)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
