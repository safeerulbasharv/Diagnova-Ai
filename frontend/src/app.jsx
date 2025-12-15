import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";

import Home from "./pages/Home";
import MlPredict from "./pages/MlPredict";
import DoctorChat from "./pages/DoctorChat";
import Radiology from "./pages/Radiology";
import OcrExtract from "./pages/OcrExtract";

import DoctorChatBox from "./components/DoctorChatBox";

import Login from "./pages/Login";
import Register from "./pages/Register";

import { API_BASE } from "./api";

/* --------------------------
   🔐 AUTH CONTEXT
--------------------------- */

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const r = localStorage.getItem("auth_user");
      return r ? JSON.parse(r) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() =>
    localStorage.getItem("token")
  );

  useEffect(() => {
    if (user)
      localStorage.setItem("auth_user", JSON.stringify(user));
    else localStorage.removeItem("auth_user");
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  const login = ({ access_token, user }) => {
    setToken(access_token);
    setUser(user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("auth_user");
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, apiBase: API_BASE }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* --------------------------
   🔐 PROTECTED ROUTE
--------------------------- */

function ProtectedRoute({ children }) {
  const auth = useAuth();
  if (!auth || !auth.token)
    return <Navigate to="/login" replace />;
  return children;
}

/* --------------------------
   🧭 NAVBAR (static HTML style)
--------------------------- */

function Navbar() {
  const auth = useAuth();
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path;

  const initials =
    auth?.user?.name?.[0]?.toUpperCase() ||
    auth?.user?.email?.[0]?.toUpperCase() ||
    "U";

  return (
    <nav className="navbar">
      {/* Left: logo + brand */}
      <div className="nav-left">
        {/* Put logo.png into public/assets/logo.png or adjust path */}
        <img
          src="/src/pages/logo.png"
          alt="Diagnova AI Logo"
          className="logo"
        />
        <div className="brand">
          <div className="brand-name">Diagnova AI</div>
          <div className="brand-tagline">
            Intelligent Healthcare Solutions
          </div>
        </div>
      </div>

      {/* Center: links */}
      <div className="nav-center">
        <Link
          to="/"
          className={`nav-link ${
            isActive("/") ? "active" : ""
          }`}
        >
          Home
        </Link>
        <Link
          to="/ml"
          className={`nav-link ${
            isActive("/ml") ? "active" : ""
          }`}
        >
          Disease Predictor
        </Link>
        <Link
          to="/radiology"
          className={`nav-link ${
            isActive("/radiology") ? "active" : ""
          }`}
        >
          Image Diagnostics
        </Link>
        <Link
          to="/ocr"
          className={`nav-link ${
            isActive("/ocr") ? "active" : ""
          }`}
        >
          Report Scanner
        </Link>
        <Link
          to="/chat"
          className={`nav-link ${
            isActive("/chat") ? "active" : ""
          }`}
        >
          AI Doctor Assistant
        </Link>
      </div>

      {/* Right: user + auth buttons */}
      <div className="nav-right">
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          <div className="user-details">
            <div className="username">
              {auth.user?.name ?? auth.user?.email ?? "Guest User"}
            </div>
            <div className="user-status">
              {auth.token ? "Signed In" : "Not Signed In"}
            </div>
          </div>
        </div>

        {!auth.token ? (
          <>
            <Link
              to="/login"
              className="btn btn-primary btn-sm"
              id="login-btn"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="btn btn-outline btn-sm"
            >
              Register
            </Link>
          </>
        ) : (
          <button
            className="btn btn-outline btn-sm"
            id="logout-btn"
            onClick={auth.logout}
          >
            Sign Out
          </button>
        )}
      </div>
    </nav>
  );
}

/* --------------------------
   🏠 SHELL LAYOUT
--------------------------- */

function Shell({ children }) {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="main-content">
        {children}
      </main>
      <DoctorChatBox />
    </div>
  );
}

/* --------------------------
   🚀 MAIN APP
--------------------------- */

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ml"
              element={
                <ProtectedRoute>
                  <MlPredict />
                </ProtectedRoute>
              }
            />

            <Route
              path="/radiology"
              element={
                <ProtectedRoute>
                  <Radiology />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ocr"
              element={
                <ProtectedRoute>
                  <OcrExtract />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <DoctorChat />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route
              path="*"
              element={<Navigate to="/" replace />}
            />
          </Routes>
        </Shell>
      </AuthProvider>
    </BrowserRouter>
  );
}
