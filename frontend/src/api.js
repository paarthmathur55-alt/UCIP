const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function getToken() {
  return localStorage.getItem("ucip_token");
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (resp.status === 401) {
    localStorage.removeItem("ucip_token");
    localStorage.removeItem("ucip_role");
    localStorage.removeItem("ucip_email");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ? JSON.stringify(body.detail) : detail;
    } catch (_) {}
    throw new Error(detail);
  }
  if (resp.status === 204) return null;
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  BASE_URL,
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),

  listCameras: () => request("/cameras"),
  createCamera: (data) => request("/cameras", { method: "POST", body: JSON.stringify(data) }),
  updateCamera: (id, data) => request(`/cameras/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  setCameraStatus: (id, status) =>
    request(`/cameras/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  disableCamera: (id) => request(`/cameras/${id}`, { method: "DELETE" }),

  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ""}`);
  },
  trackEntity: (value) => request(`/events/track/${encodeURIComponent(value)}`),

  listWatchlist: () => request("/watchlist"),
  addWatchlist: (data) => request("/watchlist", { method: "POST", body: JSON.stringify(data) }),
  deactivateWatchlist: (id) => request(`/watchlist/${id}/deactivate`, { method: "PATCH" }),

  listAlerts: (status) => request(`/alerts${status ? `?status=${status}` : ""}`),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: "PATCH" }),
  resolveAlert: (id) => request(`/alerts/${id}/resolve`, { method: "PATCH" }),

  summary: () => request("/dashboard/summary"),
};

export function wsUrl() {
  const url = new URL(BASE_URL);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/ws`;
}
