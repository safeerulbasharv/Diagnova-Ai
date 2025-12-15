// Login.jsx

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../app";
import { API_BASE } from "../api";

export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  const emailRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [remember, setRemember] = useState(false); // NEW ✔

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // validations
  const [validEmail, setValidEmail] = useState(false);
  const [validPassword, setValidPassword] = useState(false);

  const [toast, setToast] = useState(null);

  // Focus on email input
  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  // Restore Remember Me and saved email ✔
  useEffect(() => {
    const savedRemember = localStorage.getItem("rememberMe") === "true";
    const savedEmail = localStorage.getItem("rememberEmail");

    if (savedRemember) {
      setRemember(true);
      if (savedEmail) setEmail(savedEmail);
    }
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  useEffect(() => {
    setValidEmail(emailRegex.test(email.trim()));
  }, [email]);

  useEffect(() => {
    setValidPassword(password.length >= 6);
  }, [password]);

  const canSubmit = validEmail && validPassword && !loading;

  const login = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Login failed");

      // Save auth (unchanged)
      auth.login({ access_token: data.access_token, user: data.user });

      // NEW ✔ Remember Me behavior
      if (remember) {
        localStorage.setItem("rememberMe", "true");
        localStorage.setItem("rememberEmail", email);
      } else {
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("rememberEmail");
      }

      // toast
      setToast({
        type: "success",
        title: "Signed in",
        message: "Welcome back — redirecting...",
      });

      setTimeout(() => {
        setToast(null);
        nav("/");
      }, 600);
    } catch (e) {
      const msg = e?.message || "Login failed";
      setError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && canSubmit) login(e);
  };

  return (
    <div className="auth-container">
      <div className="auth-card" aria-live="polite">
        <h2>Welcome Back</h2>
        <p>Login to continue accessing AI Health</p>

        <form onSubmit={login} noValidate aria-label="Login form">
          {/* Email */}
          <input
            id="login-email"
            ref={emailRef}
            className="form-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
            aria-invalid={!validEmail && email !== ""}
            aria-describedby="login-email-hint"
          />
          <div
            id="login-email-hint"
            style={{
              fontSize: 12,
              color: validEmail ? "var(--platinum)" : "var(--diagnostic-amber)",
              marginTop: 6,
            }}
          >
            {email === ""
              ? "Enter your account email."
              : validEmail
              ? "Email looks valid."
              : "Please enter a valid email address."}
          </div>

          {/* Password */}
          <div style={{ position: "relative", marginTop: 12 }}>
            <input
              id="login-password"
              className="form-input"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              disabled={loading}
              aria-invalid={!validPassword && password !== ""}
              aria-describedby="login-password-hint"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                height: 32,
                width: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--platinum)",
              }}
              disabled={loading}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <div
            id="login-password-hint"
            style={{
              fontSize: 12,
              color: validPassword ? "var(--platinum)" : "var(--diagnostic-amber)",
              marginTop: 6,
            }}
          >
            {password === ""
              ? "Enter your password (min 6 characters)."
              : validPassword
              ? "Password looks OK."
              : "Password must be at least 6 characters."}
          </div>

          {/* Remember Me ✔ */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
            }}
            onClick={() => setRemember((r) => !r)}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, color: "var(--cloud)" }}>Remember Me</span>
          </div>

          {/* Submit */}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {loading ? <span className="loading" aria-hidden /> : null}
            {loading ? "Signing in..." : "Sign In"}
          </button>

          {error && (
            <p
              className="small"
              role="alert"
              style={{ color: "var(--critical-red)", marginTop: 8 }}
            >
              {error}
            </p>
          )}
        </form>

        <p className="small" style={{ marginTop: "1rem" }}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`notification notification-${toast.type}`}
          role="status"
          aria-live="polite"
          style={{ right: 32 }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{toast.title}</div>
          <div style={{ fontSize: 13 }}>{toast.message}</div>
        </div>
      )}
    </div>
  );
}
