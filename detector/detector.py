"""
Mock AI Detector Service
========================

Stands in for a real ANPR / person-detection pipeline. It does NOT run any
computer-vision model — it emits synthetic detection events on a timer, in
the exact JSON shape a real detector would use, and POSTs them to the
backend's ingest webhook.

SWAP-IN POINT: to plug in a real detector (e.g. OpenALPR, a YOLOv8 pipeline
watching the actual RTSP streams), replace the body of `generate_detection()`
with real inference output. Nothing else in this file, or in the backend,
needs to change — the contract is what matters.

Run standalone:
    pip install -r requirements.txt
    python detector.py
"""
import os
import random
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
DETECTOR_SHARED_KEY = os.getenv("DETECTOR_SHARED_KEY", "demo-detector-key")
OPERATOR_EMAIL = os.getenv("OPERATOR_EMAIL", "operator@demo.local")
OPERATOR_PASSWORD = os.getenv("OPERATOR_PASSWORD", "Operator@12345")
EMIT_INTERVAL_SECONDS = float(os.getenv("DETECTOR_EMIT_INTERVAL_SECONDS", "5"))
EMIT_PROBABILITY = float(os.getenv("DETECTOR_EMIT_PROBABILITY", "0.6"))
WATCHLIST_HIT_PROBABILITY = float(os.getenv("DETECTOR_WATCHLIST_HIT_PROBABILITY", "0.25"))

# Synthetic "normal" traffic pool (never matches the watchlist)
RANDOM_PLATES = [
    "MH12AB3456", "KA05CJ1122", "TN09XY7788", "GJ01QR4455",
    "RJ14AA9090", "PB10BC2233", "WB06DE5678", "AP09FG1010",
]
RANDOM_PERSON_TAGS = [f"PERSON-TAG-{n:04d}" for n in range(1000, 1050)]


def get_token() -> str:
    resp = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": OPERATOR_EMAIL, "password": OPERATOR_PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_cameras(token: str) -> list:
    resp = requests.get(
        f"{BACKEND_URL}/cameras",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_active_watchlist_values(token: str) -> dict:
    """Returns {'vehicle_plate': [...], 'person': [...]} of ACTIVE watchlist values."""
    resp = requests.get(
        f"{BACKEND_URL}/watchlist",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    out = {"vehicle_plate": [], "person": []}
    for entry in resp.json():
        if entry["active"]:
            out.setdefault(entry["entity_type"], []).append(entry["entity_value"])
    return out


def generate_detection(watchlist_values: dict) -> dict:
    """
    Builds one synthetic detection event. This is the ONLY function a real
    detector would replace with actual model inference output.
    """
    entity_type = random.choice(["vehicle_plate", "person"])

    use_watchlist = random.random() < WATCHLIST_HIT_PROBABILITY and watchlist_values.get(entity_type)
    if use_watchlist:
        entity_value = random.choice(watchlist_values[entity_type])
    elif entity_type == "vehicle_plate":
        entity_value = random.choice(RANDOM_PLATES)
    else:
        entity_value = random.choice(RANDOM_PERSON_TAGS)

    return {
        "entity_type": entity_type,
        "entity_value": entity_value,
        "confidence": round(random.uniform(0.72, 0.99), 2),
        "bounding_box": {
            "x": round(random.uniform(0.05, 0.6), 2),
            "y": round(random.uniform(0.05, 0.6), 2),
            "w": round(random.uniform(0.1, 0.3), 2),
            "h": round(random.uniform(0.1, 0.3), 2),
        },
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }


def ingest(camera_id: str, detection: dict):
    payload = {"camera_id": camera_id, **detection}
    try:
        resp = requests.post(
            f"{BACKEND_URL}/events/ingest",
            json=payload,
            headers={"X-Detector-Key": DETECTOR_SHARED_KEY},
            timeout=10,
        )
        if resp.status_code >= 300:
            print(f"[detector] ingest failed ({resp.status_code}): {resp.text}")
        else:
            body = resp.json()
            tag = "NEW" if body else "DUPLICATE (deduped)"
            print(f"[detector] cam={camera_id[:8]} {detection['entity_type']}={detection['entity_value']} -> {tag}")
    except requests.RequestException as e:
        print(f"[detector] request error: {e}")


def main():
    print(f"[detector] starting, backend={BACKEND_URL}")
    token = None
    cameras = []
    watchlist_values = {"vehicle_plate": [], "person": []}
    last_refresh = 0

    while True:
        try:
            if token is None:
                token = get_token()
                cameras = fetch_cameras(token)
                watchlist_values = fetch_active_watchlist_values(token)
                print(f"[detector] loaded {len(cameras)} cameras, "
                      f"{sum(len(v) for v in watchlist_values.values())} active watchlist entries")

            # refresh watchlist/camera list every 60s in case admin changed them
            if time.time() - last_refresh > 60:
                cameras = fetch_cameras(token)
                watchlist_values = fetch_active_watchlist_values(token)
                last_refresh = time.time()

            for cam in cameras:
                if cam["status"] == "offline":
                    continue
                if random.random() < EMIT_PROBABILITY:
                    detection = generate_detection(watchlist_values)
                    ingest(cam["id"], detection)

        except requests.RequestException as e:
            print(f"[detector] backend not reachable yet ({e}), retrying...")
            token = None

        time.sleep(EMIT_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
