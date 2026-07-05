import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { highlightCode } from "./codeHighlight";
import PhaseStrip from "./PhaseStrip";

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable (older browsers, insecure context).
    }
  };

  return (
    <div className="blair-code-block rounded-lg overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 text-slate-300 text-[11px]">
        <span className="uppercase tracking-wide">{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: highlightCode(code) }} />
      </pre>
    </div>
  );
}

const markdownComponents = {
  // Fenced ``` blocks always render as <pre><code>; intercepting `pre` is the
  // robust way to detect them since react-markdown v9 no longer passes an
  // `inline` flag to the `code` renderer.
  pre({ children }) {
    const codeEl = Array.isArray(children) ? children[0] : children;
    const className = codeEl?.props?.className || "";
    const match = /language-(\w+)/.exec(className);
    const codeStr = String(codeEl?.props?.children ?? "").replace(/\n$/, "");
    return <CodeBlock language={match?.[1]} code={codeStr} />;
  },
  code({ className, children }) {
    return <code className={className}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-blair-primary underline">
        {children}
      </a>
    );
  },
};

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="px-3 py-1 rounded-full bg-blair-sidebar border border-blair-border text-[11px] text-blair-muted">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 blair-prose ${
          isUser ? "blair-chat-bubble-user" : "blair-chat-bubble-ai"
        }`}
      >
        {message.job && <PhaseStrip job={message.job} className="mb-2 pb-2 border-b border-blair-border/60" />}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
        )}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-3.5 bg-blair-muted/60 ml-0.5 align-text-bottom animate-pulse" />
        )}
      </div>
    </div>
  );
}

// Renders the Blair chat history: user prompts + Blair's markdown/code
// responses, plus system-style job status updates. Reused by Dashboard.jsx,
// which owns message state and streams job status into it as it polls.
export default function ChatInterface({ messages = [], isThinking = false, greeting = "" }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  if (messages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
        <div className="w-12 h-12 rounded-full bg-blair-primary-soft flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-blair-primary" />
        </div>
        <h2 className="text-lg font-bold text-blair-text">{greeting || "What are we building today?"}</h2>
        <p className="text-sm text-blair-muted max-w-sm">
          Describe a feature, a bug fix, or an idea — Blair will plan it, build it, and show you a live preview.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto blair-scrollbar-thin px-4 py-6 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isThinking && (
        <div className="flex justify-start">
          <div className="blair-chat-bubble-ai px-4 py-2.5 flex items-center gap-2 text-sm text-blair-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Blair is thinking...
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
