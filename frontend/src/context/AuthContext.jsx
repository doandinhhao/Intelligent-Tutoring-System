import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/irmsApi";
import { configureAuthTokenProvider } from "../api/http";

const TOKEN_KEY = "irms_token";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    configureAuthTokenProvider(() => token);
  }, [token]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const me = await authApi.me();
        setUser(me);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setBooting(false);
      }
    };

    bootstrap();
  }, [token]);

  const login = async (username, password) => {
    const data = await authApi.login({ username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      booting,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user, booting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

