import React, { useState, useRef, useEffect } from "react";
import { BlairAPI } from "@/api/blair";
import { Button } from "@/components/ui/button";
import { Send, MessageSquare } from "lucide-react";

let nextMessageId = 0;
function messageId(prefix) {
  nextMessageId += 1;
  return `${prefix}-${nextMessageId}`;
}

// Compact, in-Dashboard consultation chat so the user can hand Blair plain-English
// feedback on the live preview without leaving to the full Assistant console.
// Reuses the same BlairAPI.chat endpoint as src/pages/Assistant.jsx.
export default function FeedbackChat({ provider = "mock" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.message }));
    setMessages((prev) => [...prev, { id: messageId("user"), role: "user", message: text }]);
    setInput("");
    setIsLoading(true);

    try {
      const content = await BlairAPI.chat({ prompt: text, history, provider });
      setMessages((prev) => [...prev, { id: messageId("assistant"), role: "assistant", message: content }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: messageId("error"), role: "assistant", message: `[ERROR] ${err.message}` },
      ]);
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="bg-tfrs-surface border border-tfrs-border flex flex-col h-64">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-tfrs-border shrink-0">
        <MessageSquare className="w-4 h-4 text-tfrs-gold" />
        <span className="text-xs font-mono font-bold uppercase tracking-wide text-tfrs-text">
          Give Blair Feedback
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs min-h-0">
        {messages.length === 0 && !isLoading && (
          <p className="text-tfrs-muted">Describe a change in plain English — Blair will iterate.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="whitespace-pre-wrap leading-relaxed">
            <span className={m.role === "user" ? "text-tfrs-gold" : "text-tfrs-red"}>
              {m.role === "user" ? "you $ " : "blair $ "}
            </span>
            <span className="text-tfrs-text">{m.message}</span>
          </div>
        ))}
        {isLoading && (
          <div className="text-tfrs-muted">
            <span className="text-tfrs-red">blair $ </span>
            <span className="animate-pulse">thinking...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-tfrs-border p-2 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Make the header sticky..."
          disabled={isLoading}
          className="flex-1 bg-transparent text-tfrs-text placeholder-tfrs-muted text-xs font-mono focus:outline-none px-1"
        />
        <Button
          onClick={send}
          disabled={isLoading || !input.trim()}
          size="sm"
          aria-label="Send feedback"
          className="bg-tfrs-red hover:bg-tfrs-red/90 text-tfrs-text rounded-none"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
