import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";

export default function Navbar() {
  const { email, role, isAdmin, logout } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-left">
        <span className="brand">🛰️ UCIP</span>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Dashboard
        </NavLink>
        <NavLink to="/cameras" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Cameras
        </NavLink>
        <NavLink to="/watchlist" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Watchlist
        </NavLink>
      </div>
      <div className="navbar-right">
        <span className="user-chip">{email} · {isAdmin ? "Admin" : "Operator"}</span>
        <button className="btn btn-ghost" onClick={logout}>Log out</button>
      </div>
    </header>
  );
}
