// Radiology.jsx

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app";
import { API_BASE } from "../api";

const ProbabilityBars = ({ probs }) => {
  if (!probs) return null;

  const entries = Object.entries(probs).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {entries.map(([k, v]) => {
        const pct = Math.round(Number(v) * 100);
        return (
          <div key={k} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <div style={{ textTransform: "capitalize", maxWidth: 700 }}>{k}</div>
              <div style={{ minWidth: 60, textAlign: "right" }}>
                {(v * 100).toFixed(1)}%
              </div>
            </div>
            <div
              style={{
                background: "#eee",
                height: 12,
                borderRadius: 8,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, pct))}%`,
                  height: "100%",
                  borderRadius: 8,
                  background: "#4caf50",
                  transition: "width 220ms ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default function Radiology() {
  const auth = useAuth();

  // default to empty so "Select Dataset" is shown initially
  const [dataset, setDataset] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [interpretation, setInterpretation] = useState(null);
  const [interpretLoading, setInterpretLoading] = useState(false);

  useEffect(() => {
    // cleanup preview on unmount
    return () => {
      if (preview) {
        try {
          URL.revokeObjectURL(preview);
        } catch (e) {}
      }
    };
  }, [preview]);

  const onSelected = (file) => {
    if (!file) return;
    // revoke previous preview if exists
    if (preview) {
      try {
        URL.revokeObjectURL(preview);
      } catch (e) {}
    }
    setFile(file);
    try {
      setPreview(URL.createObjectURL(file));
    } catch (e) {
      setPreview(null);
    }
    setResult(null);
    setInterpretation(null);
  };

  const clearAll = () => {
    setFile(null);
    if (preview) {
      try {
        URL.revokeObjectURL(preview);
      } catch (e) {}
    }
    setPreview(null);
    setResult(null);
    setInterpretation(null);
    setLoading(false);
    setInterpretLoading(false);
    setDataset("");
  };

  const handlePredict = async () => {
    if (!dataset) return alert("Please select a dataset before analyzing.");
    if (!file) return alert("Add image first");

    setLoading(true);
    setResult(null);
    setInterpretation(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dataset", dataset);

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/radiology_predict`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
      // start interpretation but don't block UI
      generateInterpretation(data);
    } catch (e) {
      console.error("Radiology analysis error:", e);
      alert("Analysis failed: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const generateInterpretation = async (radResult = null) => {
    const r = radResult || result;
    if (!r) {
      setInterpretation("No result available to interpret.");
      return;
    }

    // If there are no probabilities, still allow a short free-text prompt
    const probs = r.probabilities || {};
    const hasProbs = Object.keys(probs).length > 0;

    setInterpretLoading(true);
    setInterpretation(null);

    const probsText = hasProbs
      ? Object.entries(probs)
          .map(([k, v]) => `${k}: ${(v * 100).toFixed(2)}%`)
          .join("; ")
      : "Probabilities: N/A";

    // SIMPLIFIED PROMPT for basic model
    const prompt = `Medical image analysis result:
Dataset: ${r.dataset}
Predicted: ${r.predicted_label}
Confidence: ${probsText}

Provide interpretation in this simple format:

FINDING: [What the model found]
CONTEXT: [General imaging context]
NEXT: [Safe next steps]`;

    try {
      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/doctor_interpretation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ message: prompt }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const body = await res.json().catch(() => ({}));
      setInterpretation(body.reply || "No interpretation available.");
    } catch (e) {
      console.error("Interpretation error:", e);
      setInterpretation("Interpretation failed: " + (e?.message || String(e)));
    } finally {
      setInterpretLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!result) return alert("No radiology result to export.");

    try {
      const fd = new FormData();
      fd.append(
        "radiology_result",
        JSON.stringify({ ...result, interpretation: interpretation || null })
      );
      if (file instanceof File) fd.append("radiology_image", file);

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/export_pdf`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "radiology_report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed: " + (e?.message || String(e)));
    }
  };

  // small helper to render file details
  const renderFileDetails = () => {
    if (!file) return null;
    const sizeKb = file.size ? Math.round(file.size / 1024) : null;
    return (
      <div style={{ marginTop: 8, color: "var(--platinum)", fontSize: 13 }}>
        <div>{file.name}</div>
        {sizeKb !== null && <div style={{ fontSize: 12 }}>{sizeKb} KB</div>}
      </div>
    );
  };

  const formatInterpretationText = (text) => {
    if (!text) return "";

    // First, clean up the text
    let cleanedText = text
      .replace(/\*\*/g, "") // remove markdown bold
      .trim();

    // Check if the text already has our expected format
    if (cleanedText.includes("FINDING:") || cleanedText.includes("CONTEXT:") || cleanedText.includes("NEXT:")) {
      // Format with line breaks for our simple format
      return cleanedText
        .replace(/FINDING:/gi, "\nFINDING:\n")
        .replace(/CONTEXT:/gi, "\n\nCONTEXT:\n")
        .replace(/NEXT:/gi, "\n\nNEXT:\n")
        .trim();
    }

    // If it's the old format, try to parse it
    if (cleanedText.includes("MODEL INTERPRETATION:")) {
      return cleanedText
        .replace(/MODEL INTERPRETATION:/gi, "\nMODEL INTERPRETATION:\n")
        .replace(/POSSIBLE CLINICAL CONTEXT:/gi, "\n\nPOSSIBLE CLINICAL CONTEXT:\n")
        .replace(/SUGGESTED NEXT STEPS:/gi, "\n\nSUGGESTED NEXT STEPS:\n")
        .replace(/\s*-\s*/g, "\n- ")
        .trim();
    }

    // For any other format, just add line breaks after periods and colons
    return cleanedText
      .replace(/\.\s+/g, ".\n\n")
      .replace(/:\s+/g, ":\n")
      .trim();
  };

  return (
    <div className="tool-container">
      {/* Header */}
      <div className="tool-header">
        <h1 className="tool-title">AI Radiology Analyzer</h1>
      </div>

      {/* Two-column Layout */}
      <div className="two-column-layout">
        {/* Left Column: Upload & Controls */}
        <div className="card" aria-live="polite">
          <h3 className="card-title">Upload X-Ray / CT</h3>
          <p className="card-subtitle">
            Upload your X-Ray or CT scan to begin analysis.
          </p>

          <label htmlFor="dataset-select" className="sr-only">Select dataset</label>
          <select
            id="dataset-select"
            className="form-input"
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
            disabled={loading || interpretLoading}
          >
            <option value="">Select Disease</option>
            <option value="pneumoniamnist">Pneumonia Test</option>
            <option value="bloodmnist">Blood Cell Test</option>
            <option value="retinamnist">Retina Test</option>
            <option value="dermamnist">Skin Test</option>
          </select>

          <label htmlFor="radiology-file" style={{ marginTop: 12, display: "block" }} className="sr-only">Upload image</label>
          <input
            id="radiology-file"
            type="file"
            accept="image/*,application/dicom,application/dicom+json"
            className="form-input"
            onChange={(e) => {
              if (!e.target.files[0]) return;
              onSelected(e.target.files[0]);
            }}
            disabled={loading || interpretLoading}
            aria-describedby="file-help"
            style={{ marginTop: 12 }}
          />

          <div id="file-help" style={{ fontSize: 12, color: "var(--platinum)", marginTop: 6 }}>
            Supported: PNG, JPG, JPEG, DICOM (where browser/OS supports). Keep file &lt; 10MB for best results.
          </div>

          {renderFileDetails()}

          {preview && (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <h4 style={{ fontSize: 14, color: "var(--platinum)", marginBottom: 8, textAlign: "left" }}>
                Preview:
              </h4>
              <img
                src={preview}
                alt="preview"
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  height: "auto",
                  maxHeight: "250px",
                  objectFit: "contain",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "#f8f9fa",
                  padding: "8px",
                }}
              />
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handlePredict}
              disabled={loading || interpretLoading}
              aria-disabled={loading || interpretLoading}
              style={{ flex: 1, minWidth: "120px" }}
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>

            <button
              className="btn btn-outline"
              onClick={clearAll}
              disabled={loading || interpretLoading}
              style={{ flex: 1, minWidth: "100px" }}
            >
              Clear
            </button>

            {result && (
              <button
                className="btn btn-outline"
                onClick={handleExportPDF}
                disabled={loading || interpretLoading}
                style={{ flex: 1, minWidth: "100px" }}
              >
                Export PDF
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Results & Interpretation */}
        <div className="card" aria-live="polite">
          <h3 className="card-title">Result</h3>

          {!result && <p style={{ color: "var(--platinum)" }}>No result yet.</p>}

          {result && (
            <>
              <div style={{ marginBottom: 20 }}>
                <p>
                  <b>Dataset:</b> {result.dataset}
                </p>
                <p>
                  <b>Predicted:</b>{" "}
                  <span style={{ 
                    textTransform: "capitalize",
                    backgroundColor: "#e7f5ff",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontWeight: "600",
                    color: "#1971c2"
                  }}>
                    {result.predicted_label}
                  </span>
                </p>
              </div>

              <div style={{ marginTop: 10 }}>
                <ProbabilityBars probs={result.probabilities} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => generateInterpretation()}
                  disabled={interpretLoading}
                  aria-disabled={interpretLoading}
                  style={{ flex: 1, minWidth: "180px" }}
                >
                  {interpretLoading ? "Generating..." : "Generate Interpretation"}
                </button>

                <button
                  className="btn btn-outline"
                  onClick={() => {
                    if (!result) return;
                    generateInterpretation(result);
                  }}
                  disabled={interpretLoading}
                  style={{ flex: 1, minWidth: "120px" }}
                >
                  Regenerate
                </button>
              </div>

              {interpretation && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ 
                    color: "#dde4ebff", 
                    marginBottom: 12,
                    fontSize: "18px",
                    fontWeight: "600"
                  }}>
                    AI Interpretation
                  </h3>
                  <div
                    style={{
                      background: "#f8f9fa",
                      padding: 20,
                      borderRadius: 8,
                      color: "#161817ff",
                      maxHeight: 400,
                      overflowY: "auto",
                      fontSize: 14,
                      lineHeight: 1.6,
                      whiteSpace: "pre-line",
                      fontFamily: "inherit",
                      border: "1px solid #e9ecef",
                    }}
                  >
                    {formatInterpretationText(interpretation)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}