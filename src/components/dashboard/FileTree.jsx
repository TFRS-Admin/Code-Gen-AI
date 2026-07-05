import React, { useEffect, useMemo, useState } from "react";
import { BlairAPI } from "@/api/blair";
import { highlightCode } from "./codeHighlight";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  Search,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const ICON_BY_EXT = {
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  css: FileCode,
  scss: FileCode,
  html: FileCode,
  json: FileJson,
  md: FileText,
  txt: FileText,
};

function iconFor(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ICON_BY_EXT[ext] || File;
}

// Builds a nested { name, path, type, children } tree from the flat
// "path/to/file.js" -> { content, language } map returned by
// GET /api/repos/:owner/:repo/files (the same source WebContainersPreview
// consumes for booting the instant preview).
function buildTree(files) {
  const root = { name: "", path: "", type: "dir", children: new Map() };
  for (const path of Object.keys(files)) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    let currentPath = "";
    parts.forEach((part, i) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "dir",
          children: isFile ? null : new Map(),
        });
      }
      node = node.children.get(part);
    });
  }
  return root;
}

function sortedEntries(children) {
  return Array.from(children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function TreeNode({ node, depth, expanded, onToggleDir, selectedPath, onSelectFile }) {
  const Icon = node.type === "dir" ? (expanded.has(node.path) ? FolderOpen : Folder) : iconFor(node.name);
  const isOpen = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => (node.type === "dir" ? onToggleDir(node.path) : onSelectFile(node))}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left rounded-md transition-colors ${
          isSelected ? "bg-blair-primary-soft text-blair-primary" : "text-blair-text hover:bg-black/5"
        }`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${node.type === "dir" ? "text-blair-muted" : "text-blair-muted"}`} />
        <span className="truncate">{node.name}</span>
      </button>
      {node.type === "dir" && isOpen && (
        <div>
          {sortedEntries(node.children).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleDir={onToggleDir}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Repo file explorer for the right panel's Files tab: fetches the repo's
// file tree, renders it as an expandable/collapsible directory listing, and
// shows syntax-highlighted file contents on click.
export default function FileTree({ owner, repo, branch }) {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!owner || !repo || !branch) {
      setFiles(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    setSearch("");
    (async () => {
      try {
        const { files: fetched } = await BlairAPI.getRepoFiles(owner, repo, branch);
        if (cancelled) return;
        setFiles(fetched);
        const topDirs = new Set(
          Object.keys(fetched)
            .filter((p) => p.includes("/"))
            .map((p) => p.split("/")[0])
        );
        setExpanded(topDirs);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch]);

  const tree = useMemo(() => (files ? buildTree(files) : null), [files]);

  const filteredPaths = useMemo(() => {
    if (!files || !search.trim()) return null;
    const q = search.trim().toLowerCase();
    return Object.keys(files)
      .filter((p) => p.toLowerCase().includes(q))
      .sort();
  }, [files, search]);

  const toggleDir = (path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const hasRepo = !!(owner && repo && branch);

  return (
    <div className="flex flex-col h-full min-h-0">
      {!hasRepo && (
        <div className="flex-1 flex items-center justify-center text-sm text-blair-muted text-center px-6">
          Select a repository and branch to browse its files.
        </div>
      )}

      {hasRepo && loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-blair-muted">
          <Loader2 className="w-5 h-5 animate-spin text-blair-primary" />
          Loading file tree...
        </div>
      )}

      {hasRepo && !loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-red-500 text-center px-6">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {hasRepo && !loading && !error && tree && (
        <>
          <div className="p-2 border-b border-blair-border shrink-0">
            <div className="flex items-center gap-2 rounded-lg border border-blair-border px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-blair-muted shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files..."
                className="w-full bg-transparent text-xs text-blair-text placeholder-blair-muted focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto blair-scrollbar-thin p-2 min-h-0">
            {filteredPaths ? (
              filteredPaths.length === 0 ? (
                <p className="text-xs text-blair-muted px-2">No files match &quot;{search}&quot;.</p>
              ) : (
                filteredPaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setSelectedFile({ path, name: path.split("/").pop() })}
                    className={`w-full flex items-center gap-1.5 py-1 px-2 text-xs text-left rounded-md truncate transition-colors ${
                      selectedFile?.path === path ? "bg-blair-primary-soft text-blair-primary" : "text-blair-text hover:bg-black/5"
                    }`}
                  >
                    <File className="w-3.5 h-3.5 shrink-0 text-blair-muted" />
                    <span className="truncate">{path}</span>
                  </button>
                ))
              )
            ) : (
              sortedEntries(tree.children).map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  depth={0}
                  expanded={expanded}
                  onToggleDir={toggleDir}
                  selectedPath={selectedFile?.path}
                  onSelectFile={(node) => setSelectedFile(node)}
                />
              ))
            )}
          </div>

          {selectedFile && files[selectedFile.path] && (
            <div className="border-t border-blair-border max-h-64 flex flex-col shrink-0">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-blair-muted bg-blair-sidebar shrink-0">
                <span className="truncate">{selectedFile.path}</span>
                <button type="button" onClick={() => setSelectedFile(null)} className="hover:text-blair-primary">
                  Close
                </button>
              </div>
              <pre className="blair-code-block flex-1 overflow-auto p-3 text-xs m-0">
                <code
                  dangerouslySetInnerHTML={{ __html: highlightCode(files[selectedFile.path].content) }}
                />
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
