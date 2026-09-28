const SEVERITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#64748b" };

export default function AlertsPanel({ alerts, newAlertCount, onAcknowledge, onResolve }) {
  return (
    <div className="panel alerts-panel" id="alerts-panel">
      <div className="panel-header">
        <h3>🚨 Alerts</h3>
        <span className="badge">{newAlertCount ?? alerts.filter((a) => a.status === "new").length} new</span>
      </div>
      <div className="alerts-list">
        {alerts.length === 0 && <div className="empty-state">No alerts yet. Waiting for watchlist matches…</div>}
        {alerts.map((a) => (
          <div key={a.id} className={`alert-card status-${a.status}`}>
            <div className="alert-top">
              <span className="severity-dot" style={{ backgroundColor: SEVERITY_COLORS[a.severity] || "#64748b" }} />
              <b>{a.entity_value}</b>
              <span className="dim">{a.entity_type === "vehicle_plate" ? "Vehicle" : "Person"}</span>
              <span className="alert-status-chip">{a.status}</span>
            </div>
            <div className="alert-body">
              <div>{a.reason}</div>
              <div className="dim">
                📍 {a.camera_name} · {new Date(a.created_at).toLocaleString()} · {Math.round((a.confidence || 0) * 100)}% confidence
              </div>
            </div>
            {a.status !== "resolved" && (
              <div className="alert-actions">
                {a.status === "new" && (
                  <button type="button" className="btn btn-sm" aria-label={`Acknowledge alert ${a.entity_value}`} onClick={() => onAcknowledge(a.id)}>Acknowledge</button>
                )}
                <button type="button" className="btn btn-sm btn-primary" aria-label={`Resolve alert ${a.entity_value}`} onClick={() => onResolve(a.id)}>Resolve</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
