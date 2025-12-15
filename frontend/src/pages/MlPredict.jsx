// MlPredict.jsx

import React, { useState, useEffect } from "react";
import { useAuth } from "../app";
import { API_BASE } from "../api";

export default function MlPredict() {
  const auth = useAuth();

  const [form, setForm] = useState({
    age: "",
    gender: "", // default: not selected
    glucose: "",
    bmi: "",
    systolic_bp: "",
    diastolic_bp: "",
    cholesterol: "",
    creatinine: "",
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("results"); // "results" or "history"
  const [tabTransition, setTabTransition] = useState(false);

  const samples = [
    {
      label: "Young / Low Risk",
      data: {
        age: "25",
        gender: "1",
        glucose: "90",
        bmi: "21",
        systolic_bp: "118",
        diastolic_bp: "75",
        cholesterol: "155",
        creatinine: "0.9",
      },
    },
    {
      label: "Middle Age / Pre-diabetic",
      data: {
        age: "45",
        gender: "0",
        glucose: "140",
        bmi: "32",
        systolic_bp: "145",
        diastolic_bp: "95",
        cholesterol: "210",
        creatinine: "1.1",
      },
    },
    {
      label: "Senior / High BP",
      data: {
        age: "67",
        gender: "1",
        glucose: "120",
        bmi: "28",
        systolic_bp: "165",
        diastolic_bp: "102",
        cholesterol: "240",
        creatinine: "1.4",
      },
    },
    {
      label: "Critical / High Risk Case",
      data: {
        age: "58",
        gender: "0",
        glucose: "220",
        bmi: "41",
        systolic_bp: "190",
        diastolic_bp: "120",
        cholesterol: "300",
        creatinine: "2.1",
      },
    },
  ];

  // Load history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('mlPredictHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load history');
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('mlPredictHistory', JSON.stringify(history));
    }
  }, [history]);

  const updateField = (k, v) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleTabSwitch = (tab) => {
    if (tab === activeTab) return;
    
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 150);
  };

  const handleDetect = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError("");

    // require gender selection
    if (form.gender === "") {
      setError("Please select gender before running prediction.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);
    setResult(null);
    setActiveTab("results");

    try {
      const payload = {
        age: Number(form.age || 0),
        gender: Number(form.gender || 0),
        glucose: Number(form.glucose || 0),
        bmi: Number(form.bmi || 0),
        systolic_bp: Number(form.systolic_bp || 0),
        diastolic_bp: Number(form.diastolic_bp || 0),
        cholesterol: Number(form.cholesterol || 0),
        creatinine: Number(form.creatinine || 0),
      };

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/predict_auto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult({ ...data, input_values: payload });

      // Add to history
      const newHistoryItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        inputs: payload,
        result: {
          disease_type: data.disease_type,
          risk_label: data.risk_label,
          risk_score: data.risk_score
        },
        fullResult: data
      };
      
      setHistory(prev => [newHistoryItem, ...prev.slice(0, 9)]); // Keep last 10
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      setError("Prediction failed: " + msg);
      alert("Prediction failed: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setForm({
      age: "",
      gender: "",
      glucose: "",
      bmi: "",
      systolic_bp: "",
      diastolic_bp: "",
      cholesterol: "",
      creatinine: "",
    });
    setResult(null);
    setError("");
  };
  const handleExportPDF = async (e) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (!result) {
    alert("No prediction available to export.");
    return;
  }

  try {
    const fd = new FormData();
    fd.append("report", JSON.stringify(result));

    const token = auth?.token || auth?.access_token || "";

    const res = await fetch(`${API_BASE}/export_pdf`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: fd,
    });

    if (!res.ok) {
      alert("Export failed: " + (await res.text()));
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "ml_prediction_report.pdf";
    a.click();

    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Export failed: " + err.message);
  }
};


  const loadFromHistory = (historyItem) => {
    setForm({
      age: historyItem.inputs.age.toString(),
      gender: historyItem.inputs.gender.toString(),
      glucose: historyItem.inputs.glucose.toString(),
      bmi: historyItem.inputs.bmi.toString(),
      systolic_bp: historyItem.inputs.systolic_bp.toString(),
      diastolic_bp: historyItem.inputs.diastolic_bp.toString(),
      cholesterol: historyItem.inputs.cholesterol.toString(),
      creatinine: historyItem.inputs.creatinine.toString(),
    });
    setResult(historyItem.fullResult || historyItem.result);
    setActiveTab("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearHistory = () => {
    if (history.length === 0) return;
    
    if (window.confirm(`Clear all ${history.length} prediction history items?`)) {
      setHistory([]);
      localStorage.removeItem('mlPredictHistory');
    }
  };

  const getRiskColor = (riskLabel) => {
    switch (riskLabel?.toLowerCase()) {
      case 'low': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const normalizeLLMList = (items = []) => {
  if (!Array.isArray(items)) {
    // If it's a string, try to convert it
    if (typeof items === "string") {
      items = [items];
    } else {
      return [];
    }
  }

  const result = [];
  
  items.forEach((item) => {
    if (typeof item !== "string") return;
    
    let cleanedItem = item.trim();
    
    // Remove "Here are X..." patterns
    cleanedItem = cleanedItem.replace(/Here are \d+ (symptoms|recommendations|diet recommendations|health tips|exercises)( for [^:]+)?[:.]?\s*/gi, '');
    
    // Remove section headers
    cleanedItem = cleanedItem.replace(/^#\s*[^:]+:\s*/i, '');
    cleanedItem = cleanedItem.replace(/^Potential Symptoms:\s*/i, '');
    cleanedItem = cleanedItem.replace(/^Recommendations:\s*/i, '');
    cleanedItem = cleanedItem.replace(/^Diet Plan:\s*/i, '');
    cleanedItem = cleanedItem.replace(/^Exercise Plan:\s*/i, '');
    
    // Remove leading dashes/bullets
    cleanedItem = cleanedItem.replace(/^-\s*/, '');
    cleanedItem = cleanedItem.replace(/^[•*]\s*/, '');
    
    cleanedItem = cleanedItem.trim();
    if (!cleanedItem) return;
    
    // SPECIAL HANDLING: Split numbered lists that are in one line
    // Pattern: "1. Text 2. Text 3. Text"
    const numberedListRegex = /\d+\.\s+[^.]*(?:\.|$)/g;
    const matches = cleanedItem.match(numberedListRegex);
    
    if (matches && matches.length > 1) {
      // It's a numbered list in one line
      matches.forEach(match => {
        let point = match.trim();
        // Convert "1. Text" to "- Text"
        point = point.replace(/^\d+\.\s*/, '- ');
        
        // Ensure proper punctuation
        if (!/[.!?]$/.test(point)) {
          point = point + '.';
        }
        
        result.push(point);
      });
    } else if (cleanedItem.includes('1.') || cleanedItem.includes('2.') || cleanedItem.includes('3.')) {
      // Try another approach for numbered lists
      const points = cleanedItem.split(/(?=\d+\.\s+)/);
      
      points.forEach(point => {
        point = point.trim();
        if (!point) return;
        
        // Convert "1. Text" to "- Text"
        point = point.replace(/^\d+\.\s*/, '- ');
        
        // Ensure proper punctuation
        if (!/[.!?]$/.test(point)) {
          point = point + '.';
        }
        
        result.push(point);
      });
    } else if (cleanedItem.includes('\n')) {
      // Split by newlines
      const lines = cleanedItem.split('\n');
      
      lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        
        // Remove any remaining "Here are..." text
        line = line.replace(/Here are \d+ (symptoms|recommendations|diet recommendations|health tips|exercises)( for [^:]+)?[:.]?\s*/gi, '');
        
        // Remove leading dashes/bullets
        line = line.replace(/^-\s*/, '');
        line = line.replace(/^[•*]\s*/, '');
        
        line = line.trim();
        if (!line) return;
        
        // Add bullet point
        if (!line.startsWith('-') && !line.startsWith('•') && !line.startsWith('*')) {
          line = '- ' + line;
        }
        
        // Ensure proper punctuation
        if (!/[.!?]$/.test(line)) {
          line = line + '.';
        }
        
        result.push(line);
      });
    } else {
      // Single item
      // Remove any remaining "Here are..." text
      cleanedItem = cleanedItem.replace(/Here are \d+ (symptoms|recommendations|diet recommendations|health tips|exercises)( for [^:]+)?[:.]?\s*/gi, '');
      
      // Add bullet point if needed
      if (!cleanedItem.startsWith('-') && !cleanedItem.startsWith('•') && !cleanedItem.startsWith('*')) {
        cleanedItem = '- ' + cleanedItem;
      }
      
      // Ensure proper punctuation
      if (!/[.!?]$/.test(cleanedItem)) {
        cleanedItem = cleanedItem + '.';
      }
      
      result.push(cleanedItem);
    }
  });
  
  return result;
};

  const formatRiskScore = (score) => {
    if (score === null || score === undefined) return "N/A";

    const num = Number(score);

    // If model returns probability (0–1), convert to %
    if (num > 0 && num <= 1) {
      return (num * 100).toFixed(2);
    }

    // If already percentage
    if (num > 1 && num <= 100) {
      return num.toFixed(2);
    }

    return num.toString();
  };

  return (
    <div className="tool-container">
      {/* Header - matches static ML page */}
      <div className="tool-header">
        <div>
          <h1 className="tool-title">AI Health Predictor</h1>
          <p className="tool-description">
            Advanced machine learning analysis for health risk assessment and
            predictive insights.
          </p>
        </div>
      </div>

      {/* Two-column layout (form handles submit) */}
      <form
        className="two-column-layout"
        onSubmit={handleDetect}
        aria-labelledby="ml-title"
      >
        {/* Left: input card */}
        <div className="card" aria-hidden={loading}>
          <div className="card-header">
            <div>
              <h2 id="ml-title" className="card-title">Health Parameters</h2>
              <p className="card-subtitle">
                Enter health metrics for AI-powered risk assessment
              </p>
            </div>
          </div>

          {/* Sample Test Cases */}
          <div className="samples-section">
            <h4 className="samples-title">
              <span className="samples-icon">⚗️</span> Sample Test Cases
            </h4>

            <div className="samples-grid">
              {samples.map((s, i) => (
                <button
                  key={i}
                  className="btn btn-outline sample-btn"
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setForm(s.data);
                    setResult(null);
                    setError("");
                    window.scrollTo({ top: 200, behavior: "smooth" });
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-column">
              <div className="form-group">
                <label className="form-label" htmlFor="age">Age (Years)</label>
                <input
                  id="age"
                  className="form-input"
                  placeholder="e.g., 45"
                  value={form.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  type="number"
                  min="1"
                  max="120"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="glucose">Glucose (mg/dL)</label>
                <input
                  id="glucose"
                  className="form-input"
                  placeholder="e.g., 120"
                  value={form.glucose}
                  onChange={(e) => updateField("glucose", e.target.value)}
                  type="number"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="systolic_bp">Systolic BP (mmHg)</label>
                <input
                  id="systolic_bp"
                  className="form-input"
                  placeholder="e.g., 120"
                  value={form.systolic_bp}
                  onChange={(e) => updateField("systolic_bp", e.target.value)}
                  type="number"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="cholesterol">Cholesterol (mg/dL)</label>
                <input
                  id="cholesterol"
                  className="form-input"
                  placeholder="e.g., 200"
                  value={form.cholesterol}
                  onChange={(e) => updateField("cholesterol", e.target.value)}
                  type="number"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-column">
              <div className="form-group">
                <label className="form-label" htmlFor="gender">Gender</label>
                <select
                  id="gender"
                  className="form-select"
                  value={form.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select Gender</option>
                  <option value="0">Female</option>
                  <option value="1">Male</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="bmi">BMI (kg/m²)</label>
                <input
                  id="bmi"
                  className="form-input"
                  placeholder="e.g., 24.5"
                  value={form.bmi}
                  onChange={(e) => updateField("bmi", e.target.value)}
                  type="number"
                  step="0.1"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="diastolic_bp">Diastolic BP (mmHg)</label>
                <input
                  id="diastolic_bp"
                  className="form-input"
                  placeholder="e.g., 80"
                  value={form.diastolic_bp}
                  onChange={(e) => updateField("diastolic_bp", e.target.value)}
                  type="number"
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="creatinine">Creatinine (mg/dL)</label>
                <input
                  id="creatinine"
                  className="form-input"
                  placeholder="e.g., 1.0"
                  value={form.creatinine}
                  onChange={(e) => updateField("creatinine", e.target.value)}
                  type="number"
                  step="0.01"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-outline"
              type="button"
              onClick={handleClear}
              disabled={loading}
            >
              Clear All
            </button>

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading}
            >
              {loading ? <span className="loading" aria-hidden /> : null}
              {loading ? "Detecting..." : "Run AI Prediction"}
            </button>
          </div>
        </div>

        {/* Right: results card with tabs */}
        <div className="card" role="region" aria-live="polite">
          <div className="card-header">
            <div className="tabs-header">
              <div className="tabs-container">
                <button
                  className={`tab-btn ${activeTab === "results" ? "active" : ""}`}
                  onClick={() => handleTabSwitch("results")}
                  disabled={loading || tabTransition}
                >
                  Results
                </button>
                <button
                  className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
                  onClick={() => handleTabSwitch("history")}
                  disabled={loading || tabTransition}
                >
                  History ({history.length})
                </button>
              </div>
              {activeTab === "results" && result && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportPDF}
                >
                  📄 Export PDF
                </button>
              )}
            </div>
          </div>

          <div className={`tab-content ${tabTransition ? "tab-transition" : ""}`}>
            {activeTab === "results" ? (
              <div className="results-container">
                {!result ? (
                  <div className="results-placeholder">
                    <div className="placeholder-icon">🔍</div>
                    <h3>Awaiting Analysis</h3>
                    <p>
                      Fill the form and click "Run AI Prediction" to generate
                      personalized insights.
                    </p>
                    {error && (
                      <div className="error-alert" role="alert">
                        {error}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="results-content">
                    <div className="result-summary">
                      <h3>Prediction Summary</h3>
                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="summary-label">Condition Detected</span>
                          <span className="summary-value">{result.disease_type}</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Risk Level</span>
                          <span 
                            className="summary-value risk-badge"
                            style={{ backgroundColor: getRiskColor(result.risk_label) }}
                          >
                            {result.risk_label}
                          </span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Risk Score</span>
                          <span className="summary-value">{formatRiskScore(result.risk_score)}%</span>
                        </div>
                      </div>
                    </div>

                    {result.symptoms && normalizeLLMList(result.symptoms).length > 0 && (
                      <div className="result-section">
                        <h4>Potential Symptoms</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.symptoms).map((s, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.recommendations && normalizeLLMList(result.recommendations).length > 0 && (
                      <div className="result-section">
                        <h4>Recommendations</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.recommendations).map((r, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.diet_plan && normalizeLLMList(result.diet_plan).length > 0 && (
                      <div className="result-section">
                        <h4>Diet Plan</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.diet_plan).map((d, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.exercise_plan && normalizeLLMList(result.exercise_plan).length > 0 && (
                      <div className="result-section">
                        <h4>Exercise Plan</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.exercise_plan).map((e, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.sleep_tips && normalizeLLMList(result.sleep_tips).length > 0 && (
                      <div className="result-section">
                        <h4>Sleep Tips</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.sleep_tips).map((t, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.reminders && normalizeLLMList(result.reminders).length > 0 && (
                      <div className="result-section">
                        <h4>Reminders</h4>
                        <ul className="result-list">
                          {normalizeLLMList(result.reminders).map((t, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.doctor_suggestions && normalizeLLMList(result.doctor_suggestions).length > 0 && (
                      <div className="result-section">
                        <h4>Suggested Doctors</h4>
                        <ul className="result-list">
                          {(result.doctor_suggestions).map((d, i) => (
                            <li key={i}>
                              <span className="bullet-point">•</span>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="history-container">
                {history.length === 0 ? (
                  <div className="history-placeholder">
                    <div className="placeholder-icon">📜</div>
                    <h3>No Prediction History</h3>
                    <p>Run predictions to build your history. Previous results will appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="history-controls">
                      <button
                        className="btn btn-text btn-sm"
                        onClick={clearHistory}
                        disabled={history.length === 0}
                      >
                        Clear All History
                      </button>
                    </div>
                    <div className="history-list">
                      {history.map((item) => (
                        <div key={item.id} className="history-item">
                          <div className="history-item-header">
                            <span className="history-timestamp">{item.timestamp}</span>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => loadFromHistory(item)}
                            >
                              Load
                            </button>
                          </div>
                          <div className="history-item-details">
                            <span 
                              className="history-risk-badge"
                              style={{ backgroundColor: getRiskColor(item.result.risk_label) }}
                            >
                              {item.result.risk_label}
                            </span>
                            <span className="history-disease">{item.result.disease_type}</span>
                            <span className="history-score">Score: {formatRiskScore(item.result.risk_score)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Add CSS for animations and styling */}
      <style jsx>{`
        .samples-section {
          margin-bottom: 1.5rem;
          padding: 1rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
        }
        
        .samples-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          color: var(--ai-cyan);
        }
        
        .samples-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }
        
        .sample-btn {
          padding: 0.6rem;
          font-size: 0.9rem;
          border-radius: 10px;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        
        .tabs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        
        .tabs-container {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 4px;
        }
        
        .tab-btn {
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .tab-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
        
        .tab-btn.active {
          background: var(--primary-color);
          color: white;
        }
        
        .tab-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .tab-content {
          transition: opacity 0.15s ease;
        }
        
        .tab-content.tab-transition {
          opacity: 0.5;
        }
        
        .results-placeholder,
        .history-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 3rem 1rem;
          color: #9CA3AF;
        }
        
        .placeholder-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }
        
        .error-alert {
          margin-top: 1rem;
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: var(--critical-red);
        }
        
        .result-summary {
          margin-bottom: 2rem;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }
        
        .summary-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .summary-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        .summary-value {
          font-size: 1.125rem;
          font-weight: 600;
        }
        
        .risk-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
        }
        
        .result-section {
          margin-top: 1.5rem;
        }
        
        .result-section h4 {
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }
        
        .result-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .result-list li {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .result-list li:last-child {
          border-bottom: none;
        }
        
        .bullet-point {
          color: var(--primary-color);
          font-size: 1.2rem;
          line-height: 1.4;
          flex-shrink: 0;
        }
        
        .history-controls {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 1rem;
        }
        
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .history-item {
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          transition: all 0.2s ease;
        }
        
        .history-item:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-1px);
        }
        
        .history-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }
        
        .history-timestamp {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        .history-item-details {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        
        .history-risk-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          color: white;
          font-size: 0.75rem;
          font-weight: 500;
        }
        
        .history-disease {
          font-weight: 500;
        }
        
        .history-score {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        
        @media (max-width: 768px) {
          .form-grid,
          .samples-grid {
            grid-template-columns: 1fr;
          }
          
          .tabs-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }
          
          .summary-grid {
            grid-template-columns: 1fr;
          }
          
          .history-item-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  )
}