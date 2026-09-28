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
  const [chartMode, setChartMode] = useState("frequency");
  const [timeRange, setTimeRange] = useState("10m");
  const [gridMode, setGridMode] = useState("wide");

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

  async function refreshAnalytics() {
    await loadAll();
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

  const chartData = useMemo(() => {
    const base = {
      frequency: {
        labels: ["01:11 PM", "01:16 PM", "01:21 PM", "01:26 PM", "01:31 PM", "01:36 PM", "01:41 PM", "01:46 PM", "01:51 PM", "01:56 PM", "02:01 PM", "02:06 PM"],
        series: [
          { name: "Vehicle Plates", values: [5, 6, 8, 7, 5, 9, 12, 8, 10, 7, 9, 11] },
          { name: "Pedestrians", values: [2, 4, 3, 5, 4, 6, 8, 7, 5, 6, 4, 8] },
          { name: "Total Events", values: [9, 10, 11, 13, 12, 18, 16, 15, 14, 13, 14, 17] },
        ],
      },
      alerts: {
        labels: ["01:11 PM", "01:16 PM", "01:21 PM", "01:26 PM", "01:31 PM", "01:36 PM", "01:41 PM", "01:46 PM", "01:51 PM", "01:56 PM", "02:01 PM", "02:06 PM"],
        series: [
          { name: "Vehicle Plates", values: [4, 5, 3, 6, 7, 8, 7, 6, 5, 8, 7, 9] },
          { name: "Pedestrians", values: [2, 3, 2, 4, 5, 5, 4, 6, 7, 4, 6, 5] },
          { name: "Total Events", values: [7, 8, 9, 10, 11, 12, 13, 14, 12, 15, 16, 14] },
        ],
      },
      load: {
        labels: ["01:11 PM", "01:16 PM", "01:21 PM", "01:26 PM", "01:31 PM", "01:36 PM", "01:41 PM", "01:46 PM", "01:51 PM", "01:56 PM", "02:01 PM", "02:06 PM"],
        series: [
          { name: "Vehicle Plates", values: [7, 8, 6, 10, 9, 11, 12, 8, 9, 7, 10, 12] },
          { name: "Pedestrians", values: [3, 5, 4, 4, 5, 7, 6, 5, 4, 6, 5, 7] },
          { name: "Total Events", values: [11, 14, 12, 13, 15, 18, 19, 17, 16, 14, 15, 18] },
        ],
      },
    };

    return base[chartMode] || base.frequency;
  }, [chartMode]);

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
      <div className="service-row">
        <div className="service-badge">⚡ Mock AI Detector Service</div>
        <div className="service-badge muted">🚚 Pause Auto-Emission</div>
        <div className="service-badge neutral">Interval: 4s | 39s Debug Window Active</div>
      </div>

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

      <div className="quick-capture-row">
        <span className="tag small-tag danger">Inject test event</span>
        <span className="tag highlight-tag">Plate: DL8CAF1234</span>
        <span className="tag neutral-tag">Person tag</span>
        <span className="tag success-tag">SUSPECT-984</span>
        <span className="tag info-tag">Normal Traffic</span>
      </div>

      <SearchBar onSearch={handleSearch} />

      <div className="overview-panel panel">
        <div className="overview-header">
          <div>
            <span className="eyebrow">Operations overview</span>
            <h3>Threat surface snapshot</h3>
          </div>
          <button type="button" className="segmented small active" aria-label="View current security overview">Live</button>
        </div>

        <div className="overview-grid">
          <div className="overview-card emphasis">
            <span className="overview-label">Critical Alerts</span>
            <strong>{summary.alerts_new || 0}</strong>
            <small>Requires response</small>
          </div>
          <div className="overview-card">
            <span className="overview-label">Coverage</span>
            <strong>{summary.cameras_online || 0}/{summary.cameras_total || 0}</strong>
            <small>Active networks</small>
          </div>
          <div className="overview-card">
            <span className="overview-label">Detections</span>
            <strong>{summary.events_total || 0}</strong>
            <small>Last 10 minutes</small>
          </div>
          <div className="overview-card">
            <span className="overview-label">Avg. Confidence</span>
            <strong>92%</strong>
            <small>Across alerts</small>
          </div>
        </div>
      </div>

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

      <div className="panel analytics-header">
        <div className="analytics-header-left">
          <div className="analytics-icon">◫</div>
          <div>
            <h3>Real-Time Ingestion &amp; Incident Analytics</h3>
            <p>High-frequency telemetry rates, deduplication efficiency, and MTTR resolution trends</p>
          </div>
        </div>
        <div className="analytics-header-right">
          <button type="button" className={`segmented ${chartMode === "frequency" ? "active" : ""}`} onClick={() => setChartMode("frequency")} aria-label="View event frequency analytics">Event Frequency</button>
          <button type="button" className={`segmented ${chartMode === "alerts" ? "active" : ""}`} onClick={() => setChartMode("alerts")} aria-label="View alert resolution analytics">Alert Resolutions &amp; MTTR</button>
          <button type="button" className={`segmented ${chartMode === "load" ? "active" : ""}`} onClick={() => setChartMode("load")} aria-label="View camera load and severity analytics">Camera Load &amp; Severity</button>
          <button type="button" className={`segmented small ${timeRange === "10m" ? "active" : ""}`} onClick={() => setTimeRange("10m")} aria-label="View last 10 minutes">Live (10m)</button>
          <button type="button" className={`segmented small ${timeRange === "1h" ? "active" : ""}`} onClick={() => setTimeRange("1h")} aria-label="View last hour">1 Hour</button>
          <button type="button" className={`segmented small ${timeRange === "24h" ? "active" : ""}`} onClick={() => setTimeRange("24h")} aria-label="View last 24 hours">24 Hours</button>
          <button type="button" className="segmented icon" aria-label="Refresh analytics" onClick={refreshAnalytics}>⟳</button>
        </div>
      </div>

      <div className="alerts-top-panel">
        <AlertsPanel
          alerts={alerts}
          newAlertCount={summary.alerts_new}
          onAcknowledge={acknowledge}
          onResolve={resolve}
        />
      </div>

      <div className="dashboard-grid">
        <div className="col-main">
          <div className="panel">
            <div className="feed-header">
              <h3>📹 Live Surveillance Feeds</h3>
              <div className="feed-pills">
                <button type="button" className={`segmented small ${gridMode === "dual" ? "active" : ""}`} onClick={() => setGridMode("dual")}>2x Grid</button>
                <button type="button" className={`segmented small ${gridMode === "wide" ? "active" : ""}`} onClick={() => setGridMode("wide")}>Dual Feed</button>
                <button type="button" className={`segmented small ${gridMode === "focus" ? "active" : ""}`} onClick={() => setGridMode("focus")}>Single Focused</button>
              </div>
            </div>
            <div id="camera-feed-panel" className="camera-toolbar">
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
            <div className={`video-grid ${gridMode}`}>
              {filteredCameras.length === 0 ? (
                <div className="empty-state full-width-empty">No cameras match this filter.</div>
              ) : (
                filteredCameras.map((cam) => (
                  <VideoTile key={cam.id} camera={cam} lastDetection={lastDetectionByCamera[cam.id]} />
                ))
              )}
            </div>
          </div>

          <div className="stat-card-grid">
            <div className="mini-stat-card">
              <span className="mini-label">Ingress velocity</span>
              <div className="mini-value neon">15</div>
              <div className="mini-meta">events/min</div>
            </div>
            <div className="mini-stat-card">
              <span className="mini-label">Resolution rate</span>
              <div className="mini-value">0%</div>
              <div className="mini-meta">of alerts resolved</div>
            </div>
            <div className="mini-stat-card">
              <span className="mini-label">Mean time to resolve</span>
              <div className="mini-value">2.8m</div>
              <div className="mini-meta">avg response</div>
            </div>
            <div className="mini-stat-card">
              <span className="mini-label">Classification</span>
              <div className="mini-value small">72% Veh</div>
              <div className="mini-meta">28% Ped</div>
            </div>
          </div>

          <div className="chart-panel panel">
            <div className="chart-header">
              <h3>Real-Time AI Ingestion Frequency (Detections Over Time)</h3>
              <div className="chart-legend">
                <span>Vehicle Plates</span>
                <span>Pedestrians</span>
                <span>Total Events</span>
              </div>
            </div>
            <div className="chart-surface" role="img" aria-label={`Chart for ${chartMode} over ${timeRange}`}>
              <svg viewBox="0 0 900 220" preserveAspectRatio="none" className="chart-svg">
                {[0, 1, 2, 3, 4].map((row) => (
                  <line key={row} x1="0" y1={row * 55 + 25} x2="900" y2={row * 55 + 25} stroke="rgba(148,163,184,0.15)" strokeDasharray="4 6" />
                ))}
                {chartData.series.map((series, idx) => {
                  const colorMap = ["#38bdf8", "#8b5cf6", "#fbbf24"]; 
                  const points = series.values
                    .map((value, index) => {
                      const x = (index / (series.values.length - 1)) * 860 + 20;
                      const y = 190 - (value / Math.max(...chartData.series.flatMap((s) => s.values), 1)) * 150;
                      return `${x},${y}`;
                    })
                    .join(" ");

                  return (
                    <polyline
                      key={series.name}
                      fill="none"
                      stroke={colorMap[idx % colorMap.length]}
                      strokeWidth={idx === 2 ? 2.2 : 2}
                      points={points}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
              </svg>
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
