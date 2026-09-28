export default function EventFeed({ events }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>📋 Recent Detections</h3>
      </div>
      <div className="table-wrap">
        <table className="event-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Camera</th>
              <th>Type</th>
              <th>Value</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr><td colSpan={5} className="empty-state">No events yet.</td></tr>
            )}
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.detected_at).toLocaleTimeString()}</td>
                <td>{e.camera_name || e.camera_id?.slice(0, 8)}</td>
                <td>{e.entity_type === "vehicle_plate" ? "🚗 Plate" : "🧍 Person"}</td>
                <td>{e.entity_value}</td>
                <td>{Math.round((e.confidence || 0) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
