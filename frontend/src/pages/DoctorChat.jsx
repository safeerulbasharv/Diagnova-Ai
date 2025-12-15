// DoctorChat.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app";
import { API_BASE } from "../api";

const STORAGE_KEY = "doctorChatHistory_v1";
const MAX_PERSISTED_MESSAGES = 500; // keep localStorage bounded

// Avatar helpers
const avatarChar = (who, auth) => {
  if (who === "user") {
    // try to derive from authenticated user name, fallback to "Y"
    const name = auth?.user?.name || auth?.user?.displayName || "";
    return name ? name.trim()[0].toUpperCase() : "Y";
  }
  return "D";
};
const displayName = (who) => (who === "user" ? "You" : "Doctor");

export default function DoctorChat() {
  const auth = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // helper: current time stamp (HH:MM)
  const nowTimestamp = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // safe loader for persisted messages
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // basic validation and sanitization
          const clean = parsed
            .filter((m) => m && (m.from === "user" || m.from === "doctor") && typeof m.text === "string")
            .slice(-MAX_PERSISTED_MESSAGES);
          setMessages(clean);
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }

    // focus input when component mounts
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // persist messages and scroll to bottom on change
  useEffect(() => {
    try {
      const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }

    // scroll to bottom (use immediate scroll for a11y)
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage = { from: "user", text: trimmed, ts: nowTimestamp() };
    // append user message immediately
    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setTyping(true);

    try {
      const token = auth?.token || auth?.access_token || "";
      const res = await fetch(`${API_BASE}/doctor_chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        // try to parse server error
        let serverMsg = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) serverMsg += ` - ${errJson.error}`;
        } catch (e) {
          /* ignore json parse errors */
        }
        throw new Error(serverMsg);
      }

      const data = await res.json().catch(() => ({}));
      const replyText = data?.reply || "Sorry, I couldn't generate a reply right now.";
      const doctorMessage = { from: "doctor", text: replyText, ts: nowTimestamp() };

      // append reply and clear typing
      setMessages((m) => [...m, doctorMessage]);
      setTyping(false);
    } catch (err) {
      console.error("Doctor chat error:", err);
      const doctorErr = {
        from: "doctor",
        text: "Server error. Please try again.",
        ts: nowTimestamp(),
      };
      setMessages((m) => [...m, doctorErr]);
      setTyping(false);
    } finally {
      setLoading(false);
      // re-focus input for keyboard users
      if (textareaRef.current) textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clear = async () => {
  if (loading) return;

  if (!window.confirm("Clear conversation? This will remove local and server history.")) {
    return;
  }

  try {
    const token = auth?.token || auth?.access_token || "";

    await fetch(`${API_BASE}/doctor_chat/clear`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
  } catch (e) {
    console.error("Failed to clear backend chat memory:", e);
    // still clear UI even if backend fails
  }

  // ✅ Clear frontend state
  setMessages([]);

  // ✅ Clear localStorage
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear storage:", e);
  }
};


  const exportChat = () => {
    if (!messages || messages.length === 0) return;

    const header = `Exported chat - ${new Date().toLocaleString()}\n\n`;
    const body = messages
      .map((m) => `${m.ts} - ${m.from === "user" ? "You" : "Doctor"}: ${m.text}`)
      .join("\n\n");

    const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `doctor_chat_export_${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // revoke after a short delay to be safe across browsers
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className="tool-container"
      style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* Header */}
      <div
        className="tool-header"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <h1 className="tool-title" style={{ margin: 0 }}>
          AI Doctor Assistant
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/" className="btn btn-ghost">
            Home
          </Link>
          <button
            className="btn btn-outline"
            onClick={exportChat}
            disabled={messages.length === 0}
            title={messages.length === 0 ? "No messages to export" : "Export chat"}
            aria-label="Export chat"
          >
            Export
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div
        className="chat-full"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "70vh",
          borderRadius: 8,
          overflow: "hidden",
          background: "linear-gradient(180deg,#0f1112,#0b0c0d)",
        }}
      >
        <div
          className="chat-messages"
          role="log"
          aria-live="polite"
          style={{
            overflowY: "auto",
            padding: "1.25rem",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.length === 0 && (
            <p style={{ color: "var(--platinum)", textAlign: "center", marginTop: 8 }}>
              No messages yet — start a conversation.
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                justifyContent: m.from === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.from !== "user" && (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    background: "#2b2f36",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                  aria-hidden="true"
                >
                  {avatarChar(m.from, auth)}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  maxWidth: "70%",
                  alignItems: m.from === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13, color: "var(--muted-text,#9aa0a6)" }}>
                    {displayName(m.from)}
                  </strong>
                  <span style={{ fontSize: 11, color: "var(--muted-text,#9aa0a6)" }}>{m.ts}</span>
                </div>

                <div
                  style={{
                    marginTop: 6,
                    background: m.from === "user" ? "#DCF8C6" : "var(--chat-doctor-bg,#1f2224)",
                    color: m.from === "user" ? "#051607" : "var(--chat-doctor-text,#E6E6E6)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.text}
                </div>
              </div>

              {m.from === "user" && (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: "#cfeecf",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#083b09",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                  aria-hidden="true"
                >
                  {avatarChar(m.from, auth)}
                </div>
              )}
            </div>
          ))}

          {typing && (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: "#2b2f36" }} />
              <div style={{ background: "var(--chat-doctor-bg,#1f2224)", padding: "10px 14px", borderRadius: 10 }}>
                <em style={{ color: "var(--chat-doctor-text,#E6E6E6)" }}>Doctor is typing…</em>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid rgba(255,255,255,0.04)",
            background: "linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              className="form-input"
              autoFocus
              placeholder="Ask a health question... (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              aria-label="Chat input"
              style={{
                resize: "vertical",
                minHeight: 48,
                maxHeight: 160,
                flex: 1,
                padding: 12,
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
              disabled={loading}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, width: "260px" }}>
              <button
                className="btn btn-outline"
                onClick={clear}
                disabled={loading || messages.length === 0}
                style={{ padding: "8px 16px", borderRadius: 8 }}
                aria-label="Clear chat"
                title="Clear conversation"
              >
                Clear
              </button>

              <button
                className="btn btn-outline"
                onClick={exportChat}
                disabled={messages.length === 0}
                style={{ padding: "8px 16px", borderRadius: 8 }}
                aria-label="Export chat"
                title={messages.length === 0 ? "No messages to export" : "Export chat"}
              >
                Export
              </button>

              <button
                className="btn btn-primary"
                onClick={send}
                disabled={loading || !input.trim()}
                style={{
                  marginLeft: "auto",
                  padding: "10px 24px",
                  borderRadius: 8,
                  background: "linear-gradient(90deg,#5b21b6,#8b5cf6)",
                  color: "#fff",
                  border: "none",
                }}
                aria-label="Send message"
                title={loading ? "Sending…" : "Send message"}
              >
                {loading ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
