from sqlalchemy.orm import Session

from app.models import User, Camera, Watchlist
from app.security import hash_password


def seed_if_empty(db: Session):
    if db.query(User).count() == 0:
        db.add(User(email="admin@demo.local", password_hash=hash_password("Admin@12345"), role="admin"))
        db.add(User(email="operator@demo.local", password_hash=hash_password("Operator@12345"), role="operator"))

    cameras = [
        ("C001", "Gate 1 - Main Entrance", "Traffic Ops", 28.6139, 77.2090, "Civil Lines, Delhi", "North Zone", "fixed", "simulated", f"simulated://camera-1", "RTSP/Simulated", "online", "Traffic", 30),
        ("C002", "Gate 2 - Parking Exit", "Traffic Ops", 28.6304, 77.2177, "Kashmere Gate, Delhi", "North Zone", "fixed", "simulated", "simulated://camera-2", "RTSP/Simulated", "online", "Traffic", 30),
        ("C003", "North Gate - Ring Road", "Road Safety", 28.6480, 77.2140, "Ring Road, Delhi", "North Zone", "fixed", "simulated", "simulated://north-gate", "RTSP/Simulated", "online", "Road Safety", 30),
        ("C004", "Metro Station - Kashmere Gate", "Transit", 28.6670, 77.2280, "Kashmere Gate Metro, Delhi", "Transit Corridor", "fixed", "simulated", "simulated://metro-kashmere-gate", "RTSP/Simulated", "online", "Transit", 30),
        ("C005", "Market Street - Chandni Chowk", "Commercial Security", 28.6560, 77.2300, "Chandni Chowk, Delhi", "City Core", "ptz", "simulated", "simulated://chandni-chowk", "RTSP/Simulated", "online", "Commercial", 30),
        ("C006", "Central Park - Connaught Place", "Urban Planning", 28.6315, 77.2167, "Connaught Place, Delhi", "Central Zone", "fixed", "simulated", "simulated://connaught-place", "RTSP/Simulated", "online", "Urban", 30),
        ("C007", "Hospital Road - Civil Lines", "Public Safety", 28.6760, 77.2250, "Civil Lines, Delhi", "North Zone", "fixed", "simulated", "simulated://civil-lines", "RTSP/Simulated", "online", "Public Safety", 30),
        ("C008", "Flyover - ITO Crossing", "Transport", 28.6280, 77.2410, "ITO, Delhi", "Central Zone", "ptz", "simulated", "simulated://ito-crossing", "RTSP/Simulated", "online", "Transport", 30),
        ("C009", "Bus Terminal - ISBT", "Transit", 28.6675, 77.2290, "ISBT Kashmere Gate, Delhi", "Transit Corridor", "fixed", "simulated", "simulated://isbt", "RTSP/Simulated", "online", "Transit", 30),
        ("C010", "Riverfront - Yamuna Bridge", "Infrastructure", 28.6450, 77.2500, "Yamuna Bridge, Delhi", "River Zone", "fixed", "simulated", "simulated://yamuna-bridge", "RTSP/Simulated", "online", "Infrastructure", 30),
        ("C011", "Residential Block - Kamla Nagar", "Community Safety", 28.6810, 77.2020, "Kamla Nagar, Delhi", "North Zone", "fixed", "simulated", "simulated://kamla-nagar", "RTSP/Simulated", "online", "Community", 30),
        ("C012", "Shopping Plaza - Kashmere Gate", "Retail Security", 28.6640, 77.2180, "Kashmere Gate, Delhi", "City Core", "ptz", "simulated", "simulated://shopping-plaza", "RTSP/Simulated", "online", "Retail", 30),
        ("C013", "South Checkpoint - Daryaganj", "Traffic Ops", 28.6440, 77.2430, "Daryaganj, Delhi", "South Zone", "fixed", "simulated", "simulated://daryaganj", "RTSP/Simulated", "online", "Traffic", 30),
        ("C014", "Old Delhi - Turkman Gate", "Heritage Security", 28.6505, 77.2345, "Turkman Gate, Delhi", "Old City", "fixed", "simulated", "simulated://turkman-gate", "RTSP/Simulated", "online", "Heritage", 30),
    ]

    existing_names = {row.name for row in db.query(Camera).all()}
    for camera_id, name, department, lat, lng, address, zone, camera_type, source_protocol, stream_url, stream_endpoint, status, camera_group, retention_days in cameras:
        if name in existing_names:
            continue
        db.add(Camera(
            camera_id=camera_id,
            name=name,
            department=department,
            lat=lat,
            lng=lng,
            address_label=address,
            zone=zone,
            type=camera_type,
            source_protocol=source_protocol,
            stream_endpoint=stream_endpoint,
            stream_url=stream_url,
            protocol=source_protocol,
            status=status,
            last_heartbeat_at=None,
            storage_path=f"/mnt/capture/{camera_id.lower()}",
            storage_retention_days=retention_days,
        ))

    if db.query(Watchlist).count() == 0:
        entries = [
            ("vehicle_plate", "DL8CAF1234", "Reported stolen 2026-09-01", "high"),
            ("vehicle_plate", "HR26BQ5566", "Involved in hit-and-run", "high"),
            ("vehicle_plate", "UP16CD7890", "Flagged - unpaid tolls / fraud alert", "medium"),
            ("person", "PERSON-TAG-0091", "Missing person report", "high"),
            ("person", "PERSON-TAG-0042", "Wanted - questioning", "medium"),
        ]
        for entity_type, value, reason, severity in entries:
            db.add(Watchlist(
                entity_type=entity_type, entity_value=value, reason=reason,
                severity=severity, active=True, added_by="admin@demo.local",
            ))

    db.commit()
