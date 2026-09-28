import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip } from "react-leaflet";

const STATUS_COLORS = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
};

export default function MapView({ cameras, trackPoints, center }) {
  const mapCenter = center || (cameras[0] ? [cameras[0].lat, cameras[0].lng] : [28.6139, 77.209]);

  return (
    <MapContainer center={mapCenter} zoom={12} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cameras.map((cam) => (
        <CircleMarker
          key={cam.id}
          center={[cam.lat, cam.lng]}
          radius={9}
          pathOptions={{ color: STATUS_COLORS[cam.status] || "#666", fillColor: STATUS_COLORS[cam.status] || "#666", fillOpacity: 0.8 }}
        >
          <Tooltip direction="top">{cam.name} — {cam.status}</Tooltip>
          <Popup>
            <b>{cam.name}</b><br />
            {cam.address_label}<br />
            Status: {cam.status}
          </Popup>
        </CircleMarker>
      ))}
      {trackPoints && trackPoints.length > 0 && (
        <>
          <Polyline positions={trackPoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#38bdf8", weight: 3, dashArray: "6 6" }} />
          {trackPoints.map((p, idx) => (
            <CircleMarker
              key={`${p.camera_id}-${idx}`}
              center={[p.lat, p.lng]}
              radius={6}
              pathOptions={{ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 1 }}
            >
              <Tooltip permanent direction="right">
                #{idx + 1} {p.camera_name} · {new Date(p.detected_at).toLocaleTimeString()}
              </Tooltip>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
