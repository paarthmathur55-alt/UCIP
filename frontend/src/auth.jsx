import { createContext, useContext, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [role, setRole] = useState(localStorage.getItem("ucip_role"));
  const [email, setEmail] = useState(localStorage.getItem("ucip_email"));

  const login = useCallback(async (emailInput, password) => {
    const data = await api.login(emailInput, password);
    localStorage.setItem("ucip_token", data.access_token);
    localStorage.setItem("ucip_role", data.role);
    localStorage.setItem("ucip_email", data.email);
    setRole(data.role);
    setEmail(data.email);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ucip_token");
    localStorage.removeItem("ucip_role");
    localStorage.removeItem("ucip_email");
    setRole(null);
    setEmail(null);
  }, []);

  const isAuthenticated = !!role;
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider value={{ role, email, isAuthenticated, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
