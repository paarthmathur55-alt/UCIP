import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import VideoTile from "../components/VideoTile";
import MapView from "../components/MapView";
import AlertsPanel from "../components/AlertsPanel";
import EventFeed from "../components/EventFeed";
import SearchBar from "../components/SearchBar";

export default function Dashboard() {
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lastDetectionByCamera, setLastDetectionByCamera] = useState({});
  const [trackPoints, setTrackPoints] = useState(null);
  const [trackValue, setTrackValue] = useState(null);
  const [cameraQuery, setCameraQuery] = useState("");
  const [cameraStatusFilter, setCameraStatusFilter] = useState("all");

  const loadAll = useCallback(async () => {
    const [camList, alertList, eventList, summaryData] = await Promise.all([
      api.listCameras(),
      api.listAlerts(),
      api.listEvents({ limit: 30 }),
      api.summary(),
    ]);
    setCameras(camList);
    setAlerts(alertList);
    setEvents(eventList);
    const latestByCamera = {};
    eventList.forEach((event) => {
      const current = latestByCamera[event.camera_id];
      if (!current || new Date(event.detected_at) > new Date(current.detected_at)) {
        latestByCamera[event.camera_id] = event;
      }
    });
    setLastDetectionByCamera(latestByCamera);
    setSummary(summaryData);
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => api.summary().then(setSummary).catch(() => {}), 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const handleWsMessage = useCallback((type, payload) => {
    if (type === "event.created") {
      setEvents((prev) => [{ id: payload.id, ...payload }, ...prev].slice(0, 50));
      setLastDetectionByCamera((prev) => ({ ...prev, [payload.camera_id]: payload }));
      setSummary((s) => (s ? { ...s, events_total: s.events_total + 1 } : s));
    } else if (type === "alert.created") {
      setAlerts((prev) => [
        { id: payload.id, status: "new", ...payload, created_at: payload.created_at },
        ...prev,
      ]);
      setSummary((s) => (s ? { ...s, alerts_new: s.alerts_new + 1 } : s));
    } else if (type === "alert.updated") {
      setAlerts((prev) => prev.map((a) => (a.id === payload.id ? { ...a, ...payload } : a)));
      api.summary().then(setSummary).catch(() => {});
    } else if (type === "camera.status_changed") {
      setCameras((prev) =>
        prev.map((c) => (c.id === payload.camera_id ? { ...c, status: payload.new_status } : c))
      );
      api.summary().then(setSummary).catch(() => {});
    }
  }, []);

  const { connected } = useWebSocket(handleWsMessage);

  async function acknowledge(id) {
    await api.acknowledgeAlert(id);
  }
  async function resolve(id) {
    await api.resolveAlert(id);
  }

  async function handleSearch(value) {
    setTrackValue(value);
    if (!value) {
      setTrackPoints(null);
      return;
    }
    const points = await api.trackEntity(value);
    setTrackPoints(points);
  }

  const filteredEvents = useMemo(() => {
    if (!trackValue) return events;
    return events.filter((e) => e.entity_value === trackValue);
  }, [events, trackValue]);

  const filteredCameras = useMemo(() => {
    const query = cameraQuery.trim().toLowerCase();
    return cameras.filter((cam) => {
      const matchesStatus = cameraStatusFilter === "all" || cam.status === cameraStatusFilter;
      const matchesQuery = !query || [cam.name, cam.address_label, cam.type].join(" ").toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [cameraQuery, cameraStatusFilter, cameras]);

  function cameraStatusLabel(status) {
    switch (status) {
      case "online": return "Working";
      case "degraded": return "Degraded";
      case "offline": return "Offline";
      default: return status || "Unknown";
    }
  }

  const trackedSummary = useMemo(() => {
    if (!trackValue || !trackPoints || trackPoints.length === 0) return null;

    const matchedEvent = events.find((e) => e.entity_value === trackValue) || filteredEvents[0] || null;
    const orderedPoints = [...trackPoints].sort(
      (a, b) => new Date(a.detected_at) - new Date(b.detected_at)
    );
    const latestPoint = orderedPoints.at(-1);
    const firstPoint = orderedPoints[0];

    const registrationLookup = {
      DL8CAF1234: {
        registeredTo: "Aarav Sharma",
        registrationNo: "DL08AB1234",
        vehicleType: "Sedan",
        makeModel: "Honda City",
        color: "Silver",
        insuranceStatus: "Active",
        lastUpdated: "2026-09-18",
      },
      HR26BQ5566: {
        registeredTo: "Ritika Mehta",
        registrationNo: "HR26BQ5566",
        vehicleType: "SUV",
        makeModel: "Mahindra XUV700",
        color: "White",
        insuranceStatus: "Valid",
        lastUpdated: "2026-09-14",
      },
      UP16CD7890: {
        registeredTo: "Vikram Singh",
        registrationNo: "UP16CD7890",
        vehicleType: "Hatchback",
        makeModel: "Maruti Swift",
        color: "Blue",
        insuranceStatus: "Pending renewal",
        lastUpdated: "2026-08-30",
      },
      "PERSON-TAG-0091": {
        registeredTo: "Neha Verma",
        entityType: "Person record",
        documentType: "Missing person file",
        idNo: "MP-0091",
        locality: "Civil Lines",
        status: "Active watchlist match",
      },
      "PERSON-TAG-0042": {
        registeredTo: "Aman Khanna",
        entityType: "Person record",
        documentType: "Verification record",
        idNo: "QF-0042",
        locality: "Kamla Nagar",
        status: "Follow-up required",
      },
    };

    const registrationDetails = registrationLookup[trackValue] || {
      registeredTo: "No registered owner match",
      registrationNo: "Not found",
      vehicleType: "N/A",
      makeModel: "N/A",
      color: "N/A",
      insuranceStatus: "No record",
      lastUpdated: "N/A",
    };

    return {
      label: matchedEvent?.entity_type === "person" ? "Person tag" : "Vehicle / plate",
      entityType: matchedEvent?.entity_type || "vehicle_plate",
      currentCamera: latestPoint?.camera_name || "Unknown",
      currentTime: latestPoint ? new Date(latestPoint.detected_at).toLocaleString() : "--",
      firstTime: firstPoint ? new Date(firstPoint.detected_at).toLocaleString() : "--",
      totalSightings: trackPoints.length,
      lastSeenAt: latestPoint ? latestPoint.camera_name : "Not recorded",
      locations: orderedPoints,
      registration: registrationDetails,
    };
  }, [events, filteredEvents, trackPoints, trackValue]);

  if (!summary) return <div className="loading-screen">Loading dashboard…</div>;

  return (
    <div className="dashboard">
      <div className="stat-strip">
        <Stat label="Cameras" value={summary.cameras_total} />
        <Stat label="Online" value={summary.cameras_online} color="#22c55e" />
        <Stat label="Degraded" value={summary.cameras_degraded} color="#f59e0b" />
        <Stat label="Offline" value={summary.cameras_offline} color="#ef4444" />
        <Stat label="New Alerts" value={summary.alerts_new} color="#ef4444" />
        <Stat label="Total Events" value={summary.events_total} />
        <span className={`ws-indicator ${connected ? "connected" : ""}`}>
          {connected ? "● live" : "○ reconnecting…"}
        </span>
      </div>

      <SearchBar onSearch={handleSearch} />

      {trackedSummary && (
        <div className="panel track-summary-panel">
          <div className="panel-header">
            <h3>{trackedSummary.entityType === "person" ? "🧍 Person tracking" : "🚗 Vehicle tracking"}</h3>
            <span className="badge">{trackedSummary.totalSightings} sightings</span>
          </div>

          <div className="track-summary-grid">
            <div className="track-summary-item">
              <span className="track-summary-label">Identity</span>
              <strong>{trackValue}</strong>
            </div>
            <div className="track-summary-item">
              <span className="track-summary-label">Type</span>
              <strong>{trackedSummary.label}</strong>
            </div>
            <div className="track-summary-item">
              <span className="track-summary-label">Current / last seen</span>
              <strong>{trackedSummary.currentCamera}</strong>
            </div>
            <div className="track-summary-item">
              <span className="track-summary-label">Detected at</span>
              <strong>{trackedSummary.currentTime}</strong>
            </div>
          </div>

          <div className="track-summary-note">
            {trackedSummary.entityType === "person"
              ? "Person last tracked at"
              : "Vehicle last tracked at"} {trackedSummary.lastSeenAt}.
            First sighting recorded at {trackedSummary.firstTime}.
          </div>

          <div className="track-two-col">
            <div className="track-log-panel">
              <div className="track-log-header">Tracking log</div>
              <div className="track-log-list">
                {trackedSummary.locations.map((point, index) => (
                  <div key={`${point.camera_id}-${point.detected_at}-${index}`} className="track-log-row">
                    <span className="track-log-time">{new Date(point.detected_at).toLocaleTimeString()}</span>
                    <span className="track-log-camera">{point.camera_name}</span>
                    <span className="track-log-confidence">{index === trackedSummary.locations.length - 1 ? "Current" : "Seen"}</span>
                  </div>
                ))}
                {trackedSummary.locations.length === 0 && (
                  <div className="track-log-empty">No sightings logged yet.</div>
                )}
              </div>
            </div>

            <div className="track-registration-panel">
              <div className="track-log-header">Registration details</div>
              <div className="registration-grid">
                <div className="registration-item">
                  <span className="track-summary-label">Registered to</span>
                  <strong>{trackedSummary.registration.registeredTo}</strong>
                </div>
                <div className="registration-item">
                  <span className="track-summary-label">Registration</span>
                  <strong>{trackedSummary.registration.registrationNo || "Not available"}</strong>
                </div>
                <div className="registration-item">
                  <span className="track-summary-label">Vehicle</span>
                  <strong>{trackedSummary.registration.makeModel || trackedSummary.registration.vehicleType || "Not available"}</strong>
                </div>
                <div className="registration-item">
                  <span className="track-summary-label">Type</span>
                  <strong>{trackedSummary.registration.vehicleType || trackedSummary.registration.entityType || "Not available"}</strong>
                </div>
                <div className="registration-item">
                  <span className="track-summary-label">Color</span>
                  <strong>{trackedSummary.registration.color || "Not available"}</strong>
                </div>
                <div className="registration-item">
                  <span className="track-summary-label">Insurance</span>
                  <strong>{trackedSummary.registration.insuranceStatus || "Not available"}</strong>
                </div>
                <div className="registration-item full-width">
                  <span className="track-summary-label">Status</span>
                  <strong>{trackedSummary.registration.status || trackedSummary.registration.lastUpdated || "No status record"}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="col-main">
          <div className="panel">
            <div className="panel-header"><h3>📹 Live Feeds (simulated)</h3></div>
            <div className="camera-toolbar">
              <input
                type="text"
                value={cameraQuery}
                onChange={(e) => setCameraQuery(e.target.value)}
                placeholder="Search camera name or location…"
                className="camera-filter-input"
              />
              <select
                value={cameraStatusFilter}
                onChange={(e) => setCameraStatusFilter(e.target.value)}
                className="camera-filter-select"
              >
                <option value="all">All status</option>
                <option value="online">Online</option>
                <option value="degraded">Degraded</option>
                <option value="offline">Offline</option>
              </select>
            </div>
            <div className="video-grid">
              {filteredCameras.length === 0 ? (
                <div className="empty-state full-width-empty">No cameras match this filter.</div>
              ) : (
                filteredCameras.map((cam) => (
                  <VideoTile key={cam.id} camera={cam} lastDetection={lastDetectionByCamera[cam.id]} />
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><h3>📋 Camera list</h3></div>
            <div className="table-wrap camera-table-wrap">
              <table className="event-table camera-table">
                <thead>
                  <tr>
                    <th>Camera</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last detection</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCameras.length === 0 && (
                    <tr><td colSpan={5} className="empty-state">No cameras found for this filter.</td></tr>
                  )}
                  {filteredCameras.map((cam) => {
                    const detection = lastDetectionByCamera[cam.id];
                    return (
                      <tr key={cam.id}>
                        <td>{cam.name}</td>
                        <td>{cam.address_label || `${cam.lat.toFixed(3)}, ${cam.lng.toFixed(3)}`}</td>
                        <td>{cam.type}</td>
                        <td><span className={`status-chip status-${cam.status}`}>{cameraStatusLabel(cam.status)}</span></td>
                        <td>{detection ? new Date(detection.detected_at).toLocaleTimeString() : "No recent detection"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel map-panel">
            <div className="panel-header">
              <h3>🗺️ Map{trackValue ? ` — tracking ${trackValue}` : ""}</h3>
            </div>
            <MapView cameras={cameras} trackPoints={trackPoints} />
          </div>

          <EventFeed events={filteredEvents} />
        </div>

        <div className="col-side">
          <AlertsPanel
            alerts={alerts}
            newAlertCount={summary.alerts_new}
            onAcknowledge={acknowledge}
            onResolve={resolve}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="stat">
      <span className="stat-value" style={color ? { color } : undefined}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
