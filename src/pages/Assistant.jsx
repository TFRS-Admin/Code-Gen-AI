import React, { useState, useEffect, useRef } from "react";
import { Conversation } from "@/entities/Conversation";
import { BlairAPI } from "@/api/blair";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Trash2, Terminal } from "lucide-react";

const WELCOME_MESSAGE = "I'm Blair. What are we building today?";

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState("mock");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    (async () => {
      const history = await Conversation.list();
      if (history.length > 0) {
        setMessages(history.slice().reverse());
      } else {
        const welcome = await Conversation.create({
          message: WELCOME_MESSAGE,
          role: "assistant",
        });
        setMessages([welcome]);
      }
    })();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const clearConversation = async () => {
    const all = await Conversation.list();
    await Promise.all(all.map((m) => Conversation.delete(m.id)));
    const welcome = await Conversation.create({
      message: WELCOME_MESSAGE,
      role: "assistant",
    });
    setMessages([welcome]);
  };

  const sendMessage = async () => {
    const text = inputMessage.trim();
    if (!text || isLoading) return;

    const userMessage = await Conversation.create({ message: text, role: "user" });
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.message }));
      const content = await BlairAPI.chat({ prompt: text, history, provider });
      const assistantMessage = await Conversation.create({ message: content, role: "assistant" });
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = await Conversation.create({
        message: `[ERROR] ${err.message}`,
        role: "assistant",
      });
      setMessages((prev) => [...prev, errorMessage]);
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="p-8 flex flex-col h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text flex items-center gap-2">
            <Terminal className="w-6 h-6 text-tfrs-gold" />
            Consultation Console
          </h1>
          <p className="text-sm text-tfrs-muted mt-1">Talk through the requirements before Blair builds anything.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-36 bg-tfrs-surface border-tfrs-border text-tfrs-text font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">Mock</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={clearConversation}
            className="border-tfrs-border text-tfrs-text font-mono uppercase text-xs rounded-none"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-black/60 border border-tfrs-border font-mono text-sm overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((message) => (
            <div key={message.id} className="whitespace-pre-wrap leading-relaxed">
              <span className={message.role === "user" ? "text-tfrs-gold" : "text-tfrs-red"}>
                {message.role === "user" ? "you@blair $ " : "blair $ "}
              </span>
              <span className="text-tfrs-text">{message.message}</span>
            </div>
          ))}
          {isLoading && (
            <div className="text-tfrs-muted">
              <span className="text-tfrs-red">blair $ </span>
              <span className="animate-pulse">thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-tfrs-border p-3 flex gap-2">
          <span className="text-tfrs-gold self-center">$</span>
          <input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-tfrs-text placeholder-tfrs-muted focus:outline-none"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !inputMessage.trim()}
            size="sm"
            className="bg-tfrs-red hover:bg-tfrs-red/90 text-tfrs-text rounded-none"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
