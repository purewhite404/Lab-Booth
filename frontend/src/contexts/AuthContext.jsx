import { createContext, useState, useCallback } from "react";
import { login as loginRequest } from "../api/authApi";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));

  /* --- ログイン --- */
  const login = useCallback(async (password) => {
    const nextToken = await loginRequest(password);
    setToken(nextToken);
    localStorage.setItem("token", nextToken);
  }, []);

  /* --- ログアウト --- */
  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem("token");
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}
