import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const presets = {
  demo: {
    label: "Demo Access",
    email: "operator@demo.local",
    password: "Operator@12345",
    hint: "Demo operator account for a live walkthrough",
  },
  admin: {
    label: "Admin Login",
    email: "admin@demo.local",
    password: "Admin@12345",
    hint: "Operations admin account for full control",
  },
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginMode, setLoginMode] = useState("demo");
  const [email, setEmail] = useState(presets.demo.email);
  const [password, setPassword] = useState(presets.demo.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function applyPreset(mode) {
    const next = presets[mode];
    setLoginMode(mode);
    setEmail(next.email);
    setPassword(next.password);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  const activePreset = presets[loginMode];

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>🛰️ UCIP</h1>
        <p className="dim">Unified Camera Intelligence Platform</p>

        <div className="login-mode-switch" aria-label="Login mode selection">
          {Object.entries(presets).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={`mode-btn ${loginMode === key ? "active" : ""}`}
              onClick={() => applyPreset(key)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="login-mode-copy">{activePreset.hint}</div>

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="demo-hint">
          <strong>Demo accounts</strong>
          <div>Admin: <code>admin@demo.local</code> / <code>Admin@12345</code></div>
          <div>Operator: <code>operator@demo.local</code> / <code>Operator@12345</code></div>
        </div>
      </form>
    </div>
  );
}
