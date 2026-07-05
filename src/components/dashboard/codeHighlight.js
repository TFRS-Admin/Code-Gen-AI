// Minimal, dependency-free syntax highlighter for chat/file code blocks.
// Escapes HTML first, then wraps already-escaped tokens in <span> — no raw
// input ever reaches dangerouslySetInnerHTML, so this is XSS-safe.

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "import", "export", "from", "default", "class", "extends", "new", "async",
  "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "of",
  "in", "switch", "case", "break", "continue", "do", "this", "super", "null",
  "true", "false", "undefined", "void", "yield", "static", "get", "set",
  "interface", "type", "implements", "public", "private", "protected",
  "readonly", "enum", "namespace", "declare", "def", "elif", "pass", "None",
  "True", "False", "lambda", "with", "as", "self",
]);

const TOKEN_RE =
  /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)|(\s+)|([^\sA-Za-z0-9_$]+)/g;

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightLine(line) {
  let out = "";
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line))) {
    const [, comment, str, num, word, space, punct] = match;
    if (comment) out += `<span class="text-slate-500">${escapeHtml(comment)}</span>`;
    else if (str) out += `<span class="text-emerald-400">${escapeHtml(str)}</span>`;
    else if (num) out += `<span class="text-sky-400">${escapeHtml(num)}</span>`;
    else if (word) out += KEYWORDS.has(word) ? `<span class="text-fuchsia-400">${escapeHtml(word)}</span>` : escapeHtml(word);
    else if (space) out += space;
    else if (punct) out += escapeHtml(punct);
  }
  return out;
}

export function highlightCode(code) {
  return code.split("\n").map(highlightLine).join("\n");
}
