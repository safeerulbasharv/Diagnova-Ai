// Register.jsx

import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { API_BASE } from "../api";

export default function Register() {
  const nav = useNavigate();
  const nameRef = useRef(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Validation states
  const [validName, setValidName] = useState(false);
  const [validEmail, setValidEmail] = useState(false);
  const [validPassword, setValidPassword] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // autofocus for usability
    if (nameRef.current) nameRef.current.focus();
  }, []);

  // simple email regex (keeps it client-side only)
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  // password strength: returns 'weak' | 'fair' | 'strong'
  const passwordStrength = (pw) => {
    if (!pw || pw.length < 6) return "weak";
    // give extra credit for variety of chars
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score >= 3) return "strong";
    if (score >= 1) return "fair";
    return "weak";
  };

  // update validations live
  useEffect(() => {
    setValidName(name.trim().length >= 3);
  }, [name]);

  useEffect(() => {
    setValidEmail(emailRegex.test(email.trim()));
  }, [email]);

  useEffect(() => {
    setValidPassword((pw) => password.length >= 6);
    setPasswordsMatch(password !== "" && password === confirmPassword);
  }, [password, confirmPassword]);

  const canSubmit =
    validName && validEmail && validPassword && passwordsMatch && !loading;

  const register = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Preserve original fetch logic
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed");

      // show success toast then navigate (keeps original nav behavior)
      setToast({
        type: "success",
        title: "Account created",
        message: "Registration successful — redirecting to login...",
      });

      // small delay so the user sees the toast; still preserves the redirect behavior
      setTimeout(() => {
        setToast(null);
        nav("/login");
      }, 1000);
    } catch (e) {
      // preserve original alert behaviour but also show inline error
      const msg = e?.message || "Registration failed";
      setError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // small helper to render strength UI
  const renderStrength = (pw) => {
    const s = passwordStrength(pw);
    const map = {
      weak: { label: "Weak", color: "var(--critical-red)" },
      fair: { label: "Fair", color: "var(--diagnostic-amber)" },
      strong: { label: "Strong", color: "var(--biotech-green)" },
    };
    const info = map[s];
    return (
      <div
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
        }}
      >
        <div
          style={{
            width: 72,
            height: 8,
            borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: s === "weak" ? "33%" : s === "fair" ? "66%" : "100%",
              background: info.color,
              transition: "width 220ms ease",
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: info.color }}>{info.label}</div>
      </div>
    );
  };

  return (
    <div className="auth-container">
      <div className="auth-card" aria-live="polite">
        <h2 id="register-heading">Create Account</h2>
        <p>Unlock full AI health access</p>

        <form onSubmit={register} aria-labelledby="register-heading" noValidate>
          <label className="sr-only" htmlFor="name">
          </label>
          <input
            ref={nameRef}
            id="name"
            className="form-input"
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            disabled={loading}
            aria-invalid={!validName && name !== ""}
            aria-describedby="name-hint"
          />
          <div id="name-hint" style={{ fontSize: 12, color: validName ? "var(--platinum)" : "var(--diagnostic-amber)", marginTop: 6 }}>
            {name === ""
              ? "Enter your username (min 3 characters)."
              : validName
              ? "Looks good."
              : "username should be at least 3 characters."}
          </div>

          <label className="sr-only" htmlFor="email" style={{ marginTop: 12 }}>
          </label>
          <input
            id="email"
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            disabled={loading}
            aria-invalid={!validEmail && email !== ""}
            aria-describedby="email-hint"
            style={{ marginTop: 12 }}
          />
          <div id="email-hint" style={{ fontSize: 12, color: validEmail ? "var(--platinum)" : "var(--diagnostic-amber)", marginTop: 6 }}>
            {email === ""
              ? "Please enter a email address."
              : validEmail
              ? "Email looks valid."
              : "Please enter a valid email address."}
          </div>

          <label className="sr-only" htmlFor="password" style={{ marginTop: 12 }}>
          </label>
          <div style={{ position: "relative", marginTop: 12 }}>
            <input
              id="password"
              className="form-input"
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              disabled={loading}
              aria-invalid={!validPassword && password !== ""}
              aria-describedby="password-hint"
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((s) => !s)}
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                height: 32,
                width: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--platinum)",
              }}
              disabled={loading}
            >
              {showPassword ? "👀" : "👁️"}
            </button>
          </div>

          <div id="password-hint" style={{ fontSize: 12, color: validPassword ? "var(--platinum)" : "var(--diagnostic-amber)", marginTop: 6 }}>
            {password === ""
              ? "Use at least 6 characters. Include letters, numbers, or symbols for a stronger password."
              : validPassword
              ? "Password length OK."
              : "Password must be at least 6 characters."}
          </div>

          {/* Password strength */}
          <div aria-hidden style={{ marginTop: 8 }}>
            {renderStrength(password)}
          </div>

          {/* Confirm password */}
          <label className="sr-only" htmlFor="confirmPassword" style={{ marginTop: 12 }}>
          </label>
          <input
            id="confirmPassword"
            className="form-input"
            placeholder="Confirm Password"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            disabled={loading}
            aria-invalid={!passwordsMatch && confirmPassword !== ""}
            aria-describedby="confirm-hint"
            style={{ marginTop: 12 }}
          />
          <div id="confirm-hint" style={{ fontSize: 12, color: passwordsMatch ? "var(--platinum)" : "var(--diagnostic-amber)", marginTop: 6 }}>
            {confirmPassword === ""
              ? "Re-type your password to confirm."
              : passwordsMatch
              ? "Passwords match."
              : "Passwords do not match."}
          </div>

          <button
            className="btn btn-primary"
            onClick={register}
            type="submit"
            disabled={!canSubmit}
            style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 10 }}
            aria-disabled={!canSubmit}
          >
            {loading ? <span className="loading" aria-hidden /> : null}
            {loading ? "Creating..." : "Register"}
          </button>

          {error && (
            <p
              className="small"
              role="alert"
              style={{ color: "var(--critical-red)", marginTop: "0.5rem" }}
            >
              {error}
            </p>
          )}
        </form>

        <p className="small" style={{ marginTop: "1rem" }}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>

      {/* Toast notification (uses your existing notification styles) */}
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
