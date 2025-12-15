// OcrExtract.jsx

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app";
import { API_BASE } from "../api";

export default function OcrExtract() {
  const auth = useAuth();

  const [fileRaw, setFileRaw] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [edited, setEdited] = useState({});
  const [loading, setLoading] = useState(false);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictResult, setPredictResult] = useState(null);
  const [error, setError] = useState("");

  // cleanup preview object URL on unmount / change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {}
      }
    };
  }, [previewUrl]);

  const selectFile = (file) => {
    setError("");
    if (!file) {
      setFileRaw(null);
      setPreviewUrl(null);
      setOcrResult(null);
      setPredictResult(null);
      setEdited({});
      return;
    }

    // revoke previous preview
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch (e) {}
    }

    setFileRaw(file);
    setOcrResult(null);
    setPredictResult(null);
    setEdited({});

    // create preview for images only (not for pdfs typically)
    if (/^image\//i.test(file.type)) {
      try {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } catch (e) {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  };

  const clearAll = () => {
    setFileRaw(null);
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch (e) {}
    }
    setPreviewUrl(null);
    setOcrResult(null);
    setPredictResult(null);
    setEdited({});
    setError("");
  };

  const handleExtract = async () => {
    setError("");
    if (!fileRaw) {
      setError("Select a file first.");
      return alert("Select a file first.");
    }

    setLoading(true);
    setOcrResult(null);
    setPredictResult(null);
    setEdited({});

    try {
      const fd = new FormData();
      fd.append("file", fileRaw);

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/ocr_extract`, {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : undefined,
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      setOcrResult(data || {});

      const structured = data.extracted_values || {};
      const simple = data.extracted_values_simple || {};

      // Add missing fields required for prediction
      const init = {};
      const keys = new Set([
        ...Object.keys(structured),
        ...Object.keys(simple),
        "age",
        "gender",
        "glucose",
        "cholesterol",
        "creatinine",
        "bmi",
        "systolic_bp",
        "diastolic_bp",
      ]);

      keys.forEach((k) => {
        if (structured[k]?.value !== undefined && structured[k]?.value !== null && String(structured[k].value).trim() !== "") {
          init[k] = String(structured[k].value);
        } else if (simple[k] !== undefined && simple[k] !== null && String(simple[k]).trim() !== "") {
          init[k] = String(simple[k]);
        } else {
          init[k] = "";
        }
      });

      setEdited(init);
    } catch (e) {
      console.error("OCR extract error:", e);
      const msg = e?.message || String(e);
      setError("OCR failed: " + msg);
      alert("OCR failed: " + msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePredictFromOcr = async () => {
    setError("");
    if (!ocrResult) {
      setError("Extract OCR first.");
      return alert("Extract OCR first.");
    }

    setPredictLoading(true);
    setPredictResult(null);

    try {
      const payload = {
        age: Number(edited.age || 0),
        gender: Number(edited.gender || 0),
        glucose: Number(edited.glucose || 0),
        bmi: Number(edited.bmi || 0),
        systolic_bp: Number(edited.systolic_bp || 0),
        diastolic_bp: Number(edited.diastolic_bp || 0),
        cholesterol: Number(edited.cholesterol || 0),
        creatinine: Number(edited.creatinine || 0),
      };

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/predict_auto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));

      setPredictResult({
        ...data,
        input_values: payload,
        ocr_extracted: ocrResult,
        extracted_values_simple: ocrResult.extracted_values_simple || {},
      });
    } catch (e) {
      console.error("Prediction from OCR error:", e);
      const msg = e?.message || String(e);
      setError("Prediction failed: " + msg);
      alert("Prediction failed: " + msg);
    } finally {
      setPredictLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!predictResult) {
      setError("No OCR prediction available.");
      return alert("No OCR prediction available.");
    }

    try {
      const fd = new FormData();
      fd.append("report", JSON.stringify(predictResult));
      fd.append("ocr_values", JSON.stringify(edited));

      if (fileRaw instanceof File) {
        fd.append("image", fileRaw);
      }

      const token = auth?.token || auth?.access_token || "";

      const res = await fetch(`${API_BASE}/export_pdf`, {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : undefined,
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
      a.download = "ocr_prediction_report.pdf";
      a.click();

      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) {
      console.error("Export failed:", e);
      const msg = e?.message || String(e);
      setError("Export failed: " + msg);
      alert("Export failed: " + msg);
    }
  };


const normalizeList = (arr = []) => {
  if (!Array.isArray(arr)) return [];

  return arr.flatMap(item => {
    if (typeof item !== "string") return [];

    // Split numbered sentences: "1. xxx 2. yyy"
    if (/\d+\./.test(item)) {
      return item
        .split(/\d+\.\s*/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    return item.trim() ? [item.trim()] : [];
  });
};

  // download extracted raw text as .txt
  const downloadRawText = () => {
    if (!ocrResult?.raw_text) return;
    const blob = new Blob([ocrResult.raw_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ocr_extracted.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  // small helper to render confidence indicator
  const renderConfidence = (conf) => {
    if (conf == null || isNaN(conf)) return null;
    const pct = Math.round(conf * 100);
    const color = pct >= 90 ? "var(--biotech-green)" : pct >= 70 ? "var(--diagnostic-amber)" : "var(--critical-red)";
    return (
      <span style={{ fontSize: 12, color, marginLeft: 8 }}>{pct}%</span>
    );
  };

  return (
    <div className="tool-container">
      <div className="tool-header">
        <h1 className="tool-title">Smart OCR Lab Extractor</h1>
      </div>

      <div className="two-column-layout">
        {/* Left Column — File Upload & OCR */}
        <div className="card" aria-live="polite">
          <h3 className="card-title">Upload Report</h3>
          <p className="card-subtitle">
            Upload your lab report to extract and analyze results using OCR.
          </p>

          <label htmlFor="ocr-file" className="sr-only">Upload report file</label>
          <input
            id="ocr-file"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => selectFile(e.target.files?.[0])}
            className="form-input"
            aria-describedby="ocr-file-help"
            disabled={loading || predictLoading}
          />

          <div id="ocr-file-help" style={{ fontSize: 12, color: "var(--platinum)", marginTop: 6 }}>
            Supported: PNG, JPG, JPEG, PDF. For best results keep file &lt; 10MB.
          </div>

          {previewUrl && (
            <img
              src={previewUrl}
              alt="preview"
              style={{
                width: 140,
                height: 140,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                marginTop: 12,
              }}
            />
          )}

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleExtract}
              disabled={loading || !fileRaw}
            >
              {loading ? "Extracting..." : "Extract OCR"}
            </button>

            <button
              className="btn btn-outline"
              onClick={clearAll}
              disabled={loading || predictLoading}
            >
              Clear
            </button>

            {ocrResult?.raw_text && (
              <button
                className="btn btn-outline"
                onClick={downloadRawText}
                disabled={loading || predictLoading}
              >
                Download Text
              </button>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 12, color: "var(--critical-red)" }} role="alert">
              {error}
            </div>
          )}

          {ocrResult && (
            <>
              <h4 style={{ marginTop: 20 }}>Extracted Text</h4>
              <pre className="ocr-box" style={{ whiteSpace: "pre-wrap", maxHeight: 575, overflow: "auto" }}>
                {ocrResult.raw_text || "(no text extracted)"}
              </pre>
            </>
          )}
        </div>

        {/* Right Column — Editable Values & Prediction */}
        <div className="card" aria-live="polite">
          <h3 className="card-title">Detected Values</h3>

          {ocrResult ? (
            <div className="form-grid" style={{ gap: 12 }}>
              {Object.entries(edited).map(([k, v]) => {
                const conf = ocrResult.extracted_values?.[k]?.confidence;
                return (
                  <div key={k} className="form-group" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label className="form-label" style={{ marginBottom: 6 }}>{k}</label>
                      {renderConfidence(conf)}
                    </div>
                    <input
                      className="form-input"
                      value={v}
                      onChange={(e) => setEdited((p) => ({ ...p, [k]: e.target.value }))}
                      aria-label={`Value for ${k}`}
                      style={{ width: "100%" }}
                    />
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handlePredictFromOcr}
                  disabled={predictLoading}
                >
                  {predictLoading ? "Predicting..." : "Predict from OCR"}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--platinum)" }}>No values detected. Run OCR to populate fields.</p>
          )}

          {predictResult && (
            <>
              <h3 style={{ marginTop: 20 }}>Prediction</h3>
              <p>
                <b>Disease:</b> {predictResult.disease_type}
              </p>
              <p>
                <b>Risk:</b> {predictResult.risk_label}
              </p>
              <p>
                <b>Score:</b> {predictResult.risk_score}
              </p>

              {predictResult.symptoms?.length > 0 && (
                <>
                  <h4>Symptoms</h4>
                  <ul>
                    {normalizeList(predictResult.symptoms).map((s, i) => (<li key={i}>{s}</li>))}
                  </ul>
                </>
              )}

              {predictResult.recommendations?.length > 0 && (
                <>
                  <h4>Recommendations</h4>
                  <ul>
                    {normalizeList(predictResult.recommendations).map((s, i) => (<li key={i}>{s}</li>))}
                  </ul>
                </>
              )}

              {predictResult.diet_plan?.length > 0 && (
                <>
                  <h4>Diet Plan</h4>
                  <ul>
                    {normalizeList(predictResult.diet_plan).map((s, i) => (<li key={i}>{s}</li>))}
                  </ul>
                </>
              )}

              {predictResult.exercise_plan?.length > 0 && (
                <>
                  <h4>Exercise Plan</h4>
                  <ul>
                    {normalizeList(predictResult.exercise_plan).map((s, i) => (<li key={i}>{s}</li>))}
                  </ul>
                </>
              )}

              {predictResult.sleep_tips?.length > 0 && (
                <>
                  <h4>Sleep Tips</h4>
                  <ul>
                    {predictResult.sleep_tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </>
              )}

              {predictResult.reminders?.length > 0 && (
                <>
                  <h4>Reminders</h4>
                  <ul>
                    {predictResult.reminders.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </>
              )}

              {predictResult.doctor_suggestions?.length > 0 && (
                <>
                  <h4>Suggested Doctors</h4>
                  <ul>
                    {predictResult.doctor_suggestions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </>
              )}

              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleExportPDF}
                >
                  Export PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
