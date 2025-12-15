// Home.jsx

import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app";

export default function Home() {
  const auth = useAuth();
  const user = auth?.user ?? null;

  return (
    <main className="dashboard-container" role="main" aria-labelledby="home-hero">
      {/* Hero Section */}
      <section className="hero-section" aria-labelledby="home-hero">
        <h1 id="home-hero" className="hero-title">
          AI-Powered Healthcare Intelligence
        </h1>

        <p className="hero-description">
          Advanced artificial intelligence platform for health predictions,
          medical imaging analysis, and intelligent healthcare consultations.
          Empowering better health decisions through technology.
        </p>

        <div style={{ marginTop: "1.5rem" }}>
          <Link
            to="/ml"
            className="btn btn-primary btn-lg"
            role="button"
            aria-label="Get started with AI Health Predictor"
          >
            Get Started
          </Link>
        </div>

        {/* Show only username / email */}
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.85rem",
            opacity: 0.9,
          }}
        >
          Logged in as:{" "}
          <strong>
            {user?.name ?? user?.email ?? "Unknown"}
          </strong>
        </p>
      </section>

      {/* Feature Cards */}
      <section className="features-grid" aria-label="Platform features">
        <div className="feature-card">
          <div className="feature-icon">ML</div>
          <h3 className="feature-title">Health Predictor</h3>
          <p className="feature-description">
            Machine learning models analyze health parameters to predict
            potential risks and provide personalized health insights.
          </p>
          <Link to="/ml" className="btn btn-outline" style={{ marginTop: "1rem" }}>
            Try Now
          </Link>
        </div>

        <div className="feature-card">
          <div className="feature-icon">RI</div>
          <h3 className="feature-title">Radiology Analyzer</h3>
          <p className="feature-description">
            AI-powered analysis of medical images for accurate diagnostic
            support and triage assistance.
          </p>
          <Link
            to="/radiology"
            className="btn btn-outline"
            style={{ marginTop: "1rem" }}
          >
            Try Now
          </Link>
        </div>

        <div className="feature-card">
          <div className="feature-icon">OCR</div>
          <h3 className="feature-title">Smart OCR</h3>
          <p className="feature-description">
            Extract and analyze text from medical documents and lab reports with
            high accuracy using OCR and structured parsing.
          </p>
          <Link
            to="/ocr"
            className="btn btn-outline"
            style={{ marginTop: "1rem" }}
          >
            Try Now
          </Link>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🤖</div>
          <h3 className="feature-title">Doctor Chat</h3>
          <p className="feature-description">
            Interactive AI-powered medical consultations for symptom analysis
            and general health guidance (not a replacement for a doctor).
          </p>
          <Link
            to="/chat"
            className="btn btn-outline"
            style={{ marginTop: "1rem" }}
          >
            Try Now
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-grid" aria-label="Platform statistics">
        <div className="stat-card">
          <div className="stat-value">95.2%</div>
          <div className="stat-label">Prediction Accuracy (test set)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">10K+</div>
          <div className="stat-label">Health Checks Simulated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">24/7</div>
          <div className="stat-label">Availability</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">98.5%</div>
          <div className="stat-label">User Satisfaction</div>
        </div>
      </section>
    </main>
  );
}
