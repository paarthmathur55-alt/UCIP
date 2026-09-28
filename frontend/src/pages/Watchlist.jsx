import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const emptyForm = { entity_type: "vehicle_plate", entity_value: "", reason: "", severity: "medium" };

export default function Watchlist() {
  const { isAdmin } = useAuth();
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function load() {
    setEntries(await api.listWatchlist());
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.addWatchlist(form);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.message || "Failed to add entry");
    }
  }

  async function deactivate(id) {
    await api.deactivateWatchlist(id);
    load();
  }

  return (
    <div className="page">
      <h2>🎯 Watchlist</h2>
      <div className="panel">
        <div className="panel-header"><h3>Active & Past Entries</h3></div>
        <table className="event-table">
          <thead>
            <tr><th>Type</th><th>Value</th><th>Reason</th><th>Severity</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {entries.map((w) => (
              <tr key={w.id}>
                <td>{w.entity_type === "vehicle_plate" ? "🚗 Vehicle" : "🧍 Person"}</td>
                <td><b>{w.entity_value}</b></td>
                <td>{w.reason}</td>
                <td><span className={`severity-chip severity-${w.severity}`}>{w.severity}</span></td>
                <td>{w.active ? "Active" : "Inactive"}</td>
                {isAdmin && (
                  <td>
                    {w.active && <button className="btn btn-sm" onClick={() => deactivate(w.id)}>Deactivate</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isAdmin && (
          <form className="inline-form" onSubmit={submit}>
            <h4>Add Watchlist Entry</h4>
            {error && <div className="error-text">{error}</div>}
            <div className="form-row">
              <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })}>
                <option value="vehicle_plate">Vehicle Plate</option>
                <option value="person">Person Tag</option>
              </select>
              <input placeholder="Value (e.g. DL8CAF1234)" required value={form.entity_value} onChange={(e) => setForm({ ...form, entity_value: e.target.value })} />
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <button className="btn btn-primary" type="submit">Add Entry</button>
          </form>
        )}
      </div>
    </div>
  );
}
