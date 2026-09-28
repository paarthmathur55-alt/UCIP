import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import MapView from "../components/MapView";

const emptyForm = { name: "", lat: "", lng: "", address_label: "", type: "fixed", stream_url: "", protocol: "simulated" };

export default function Cameras() {
  const { isAdmin } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function load() {
    setCameras(await api.listCameras());
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createCamera({
        ...form,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
      });
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.message || "Failed to create camera");
    }
  }

  async function toggleStatus(cam) {
    const next = cam.status === "offline" ? "online" : "offline";
    await api.setCameraStatus(cam.id, next);
    load();
  }

  return (
    <div className="page">
      <h2>📹 Camera Registry</h2>
      <div className="two-col">
        <div className="panel">
          <div className="panel-header"><h3>All Cameras</h3></div>
          <table className="event-table">
            <thead>
              <tr><th>Name</th><th>Location</th><th>Protocol</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr>
            </thead>
            <tbody>
              {cameras.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.address_label || `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`}</td>
                  <td>{c.protocol}</td>
                  <td><span className={`status-chip status-${c.status}`}>{c.status}</span></td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-sm" onClick={() => toggleStatus(c)}>
                        {c.status === "offline" ? "Enable" : "Disable"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {isAdmin && (
            <form className="inline-form" onSubmit={submit}>
              <h4>Add Camera</h4>
              {error && <div className="error-text">{error}</div>}
              <div className="form-row">
                <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input placeholder="Latitude" required type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
                <input placeholder="Longitude" required type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
              </div>
              <div className="form-row">
                <input placeholder="Address label" value={form.address_label} onChange={(e) => setForm({ ...form, address_label: e.target.value })} />
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="fixed">Fixed</option>
                  <option value="ptz">PTZ</option>
                </select>
                <input placeholder="Stream URL (optional)" value={form.stream_url} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} />
              </div>
              <button className="btn btn-primary" type="submit">Add Camera</button>
            </form>
          )}
        </div>

        <div className="panel map-panel">
          <div className="panel-header"><h3>Map</h3></div>
          <MapView cameras={cameras} />
        </div>
      </div>
    </div>
  );
}
