import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth";

export default function Navbar() {
  const navigate = useNavigate();
  const { email, logout } = useAuth();
  const [simEnabled, setSimEnabled] = useState(true);
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");

  const navItems = [
    { label: "Dashboard", route: "/dashboard" },
    { label: "Analytics Trends", route: "/cameras" },
    { label: "GIS Tracking", route: "/watchlist" },
    { label: "Camera Registry", route: "/cameras" },
    { label: "Watchlists", route: "/watchlist" },
    { label: "Event Forensics", route: "/dashboard" },
    { label: "Security & Audits", route: "/dashboard" },
    { label: "Architecture Docs", route: "/dashboard" },
  ];

  function focusSearch() {
    const searchInput = document.getElementById("dashboard-search-input");
    if (searchInput) {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function jumpToAlerts() {
    const panel = document.getElementById("alerts-panel");
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function jumpToCameraStatus() {
    const target = document.getElementById("camera-feed-panel");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleNavClick(item) {
    setActiveNav(item.label);
    navigate(item.route);
  }

  return (
    <header className="navbar">
      <div className="navbar-row topbar">
        <div className="brand-block">
          <div className="brand-mark">U</div>
          <div className="brand-copy">
            <div className="brand-line">
              <span className="brand-title">UCIP</span>
              <span className="brand-badge">V2.6 ENTERPRISE</span>
              <span className="live-badge">LIVE</span>
            </div>
            <div className="brand-subtitle">Unified CCTV Intelligence &amp; Real-Time AI Telemetry</div>
          </div>
        </div>

        <div className="topbar-tools">
          <div className="header-search" aria-label="Search plate or person">
            <span className="search-icon">⌕</span>
            <span className="search-placeholder">Search plate (DL8CAF1234) or person (SUSP)</span>
          </div>
          <button type="button" className="pill-btn primary" aria-label="Focus search box" onClick={focusSearch}>Track</button>
          <button type="button" className="pill-btn user-pill" aria-label="Logged in user">👤 {email || "Admin"}</button>
        </div>
      </div>

      <div className="navbar-row nav-row">
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-link ${activeNav === item.label ? "active" : ""}`}
              onClick={() => handleNavClick(item)}
              aria-label={item.label}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="context-chips" aria-label="Current tags">
          <span className="context-chip stolen">+ Stolen</span>
          <span className="context-chip plate">Plate</span>
          <span className="context-chip suspect">Suspect</span>
          <button type="button" className="btn btn-ghost small-btn" aria-label="Log out" onClick={logout}>Log out</button>
        </div>
      </div>
    </header>
  );
}
