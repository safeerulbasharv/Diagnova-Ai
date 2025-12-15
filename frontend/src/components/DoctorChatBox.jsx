// DoctorChatBox
import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../app";
import { API_BASE } from "../api";

export default function DoctorChatBox() {
  const auth = useAuth();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  // scroll to bottom when messages update
  useEffect(() => {
    if (messagesRef.current) {
      try {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      } catch (e) {}
    }
  }, [messages]);

  // focus input when chat opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // allow Enter to send and Shift+Enter for newline
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    // Add user message immediately
    setMessages((m) => [...m, { from: "user", text }]);
    setInput("");
    setLoading(true);

    // choose token in a few common locations
    const token =
      (auth && (auth.token || auth.access_token || auth?.user?.access_token)) ||
      "";

    const controller = new AbortController();
    const signal = controller.signal;

    try {
      const res = await fetch(`${API_BASE}/doctor_chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal,
      });

      // parse safely
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // server returned an error message
        const errText = data.detail || data.error || `Server error (${res.status})`;
        setMessages((m) => [...m, { from: "doctor", text: errText }]);
      } else {
        // normal reply
        const reply = data.reply ?? data.message ?? "Sorry, no reply.";
        setMessages((m) => [...m, { from: "doctor", text: reply }]);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        // fetch was aborted (component unmounted) — do nothing
      } else {
        setMessages((m) => [
          ...m,
          { from: "doctor", text: "Network error. Try again later." },
        ]);
      }
    } finally {
      setLoading(false);
    }

    // cleanup: abort if necessary (not strictly needed per-call, but safe)
    return () => controller.abort();
  };

  const clearChat = () => setMessages([]);

  return (
    <>
      {/* Floating Chat Trigger Button */}
      {!open && (
        <button
          className="chat-trigger"
          onClick={() => setOpen(true)}
          aria-label="Open Doctor Chat"
          title="Open Doctor Chat"
        >
          💬
        </button>
      )}

      {/* Chatbox */}
      {open && (
        <div
          className="chatbox"
          role="dialog"
          aria-label="Doctor chat dialog"
          aria-modal="false"
        >
          {/* Header */}
          <div className="head">
            <div
              style={{
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              💬 Doctor Chat
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={clearChat}
                style={{
                  border: "none",
                  background: "#e5e7eb",
                  padding: "4px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                aria-label="Clear chat"
                title="Clear chat"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
                aria-label="Close chat"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="messages"
            ref={messagesRef}
            style={{ overflowY: "auto", maxHeight: "300px", padding: "8px" }}
            tabIndex={0}
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 && (
              <div className="small">No messages yet. Ask a quick question.</div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`msg ${m.from === "user" ? "user" : "doctor"}`}
                aria-label={m.from === "user" ? "User message" : "Doctor message"}
              >
                <b style={{ fontSize: 12 }}>
                  {m.from === "user" ? "You" : "Doctor"}
                </b>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <div className="compose" style={{ display: "flex", gap: 8, padding: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={handleKeyDown}
              aria-label="Type a message"
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                color: "var(--snow)",
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading}
              aria-label="Send message"
              title="Send message"
              aria-busy={loading}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "#6b7280" : "var(--gradient-neural)",
                color: "#fff",
                fontWeight: 700,
                boxShadow: loading ? "none" : "var(--shadow-md)",
              }}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
