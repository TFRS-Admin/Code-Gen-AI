import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Code, Link2, Paperclip, Send, X } from "lucide-react";

const MAX_HEIGHT_PX = 200;

function wrapSelection(textareaRef, onChange, before, after = before) {
  const el = textareaRef.current;
  if (!el) return;
  const { selectionStart, selectionEnd, value } = el;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
  });
}

const TOOLBAR_BUTTONS = [
  { icon: Bold, label: "Bold", apply: (ref, onChange) => wrapSelection(ref, onChange, "**") },
  { icon: Italic, label: "Italic", apply: (ref, onChange) => wrapSelection(ref, onChange, "_") },
  { icon: Code, label: "Code", apply: (ref, onChange) => wrapSelection(ref, onChange, "`") },
  { icon: Link2, label: "Link", apply: (ref, onChange) => wrapSelection(ref, onChange, "[", "](https://)") },
];

// Multiline chat composer: formatting toolbar, attach button, send-on-Enter.
// Reused by Dashboard.jsx, which owns the prompt value and submit handler.
export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Describe what you want to build...",
  attachments = [],
  onAttach,
  onRemoveAttachment,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleInput = (e) => {
    onChange(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length && onAttach) onAttach(files);
    e.target.value = "";
  };

  return (
    <div className="border-t border-blair-border bg-blair-bg px-4 py-3 shrink-0">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((file, i) => (
            <span
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 bg-blair-sidebar border border-blair-border rounded-full pl-3 pr-1.5 py-1 text-xs text-blair-text"
            >
              <Paperclip className="w-3 h-3 text-blair-muted" />
              {file.name}
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(i)}
                aria-label={`Remove ${file.name}`}
                className="hover:text-blair-primary"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="border border-blair-border rounded-2xl focus-within:border-blair-primary transition-colors bg-blair-bg">
        <div className="flex items-center gap-1 px-2 pt-2">
          {TOOLBAR_BUTTONS.map(({ icon: Icon, label, apply }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              disabled={disabled}
              onClick={() => apply(textareaRef, onChange)}
              className="p-1.5 rounded-md text-blair-muted hover:text-blair-primary hover:bg-blair-primary-soft transition-colors disabled:opacity-40"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-blair-text placeholder-blair-muted focus:outline-none disabled:opacity-60"
          style={{ maxHeight: MAX_HEIGHT_PX }}
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Attach file"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-blair-muted hover:text-blair-primary hover:bg-blair-primary-soft transition-colors disabled:opacity-40"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
            <span className="text-[11px] text-blair-muted">{value.length > 0 ? `${value.length} chars` : ""}</span>
          </div>
          <Button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            size="sm"
            className="bg-blair-primary hover:bg-blair-primary-hover text-white rounded-full px-4"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
