import React, { useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";
import { BlairAPI } from "@/api/blair";
import { Loader2, AlertTriangle, MonitorPlay } from "lucide-react";

// A WebContainer instance can only be booted once per browser tab. This
// module-level singleton is torn down and rebooted whenever the selected
// repo/branch changes, so every render of the app shares (and serializes
// access to) a single boot.
let containerPromise = null;

async function resetContainer() {
  if (!containerPromise) return;
  const previous = containerPromise;
  containerPromise = null;
  try {
    const instance = await previous;
    instance.teardown();
  } catch {
    // Previous boot may have already failed — nothing to tear down.
  }
}

// Converts the flat "path/to/file.js" -> { content, language } map returned
// by GET /api/repos/:owner/:repo/files into the nested FileSystemTree shape
// WebContainers' mount() expects.
function toFileSystemTree(files) {
  /** @type {Record<string, any>} */
  const tree = {};
  for (const [path, file] of Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!node[dirName]) node[dirName] = { directory: {} };
      node = node[dirName].directory;
    }
    const fileName = parts[parts.length - 1];
    if (fileName) node[fileName] = { file: { contents: file.content } };
  }
  return tree;
}

// Picks which package.json script to run as the dev server, preferring "dev"
// (Vite/most modern tooling) and falling back to "start" (CRA and others).
function pickStartScript(files) {
  const pkg = files["package.json"];
  if (!pkg) throw new Error("No package.json found in this repo — can't determine how to start it.");
  let parsed;
  try {
    parsed = JSON.parse(pkg.content);
  } catch {
    throw new Error("package.json could not be parsed.");
  }
  const scripts = parsed.scripts || {};
  if (scripts.dev) return "dev";
  if (scripts.start) return "start";
  throw new Error('package.json has no "dev" or "start" script to run.');
}

const STAGE_LABEL = {
  fetching: "Fetching repository files...",
  booting: "Booting WebContainer runtime...",
  installing: "Installing dependencies...",
  starting: "Starting dev server...",
};

const STATUS_DOT = {
  fetching: "bg-tfrs-gold animate-pulse",
  booting: "bg-tfrs-gold animate-pulse",
  installing: "bg-tfrs-gold animate-pulse",
  starting: "bg-tfrs-gold animate-pulse",
  ready: "bg-tfrs-gold",
  error: "bg-tfrs-red",
};

const STATUS_LABEL = {
  fetching: "LOADING",
  booting: "LOADING",
  installing: "INSTALLING",
  starting: "STARTING",
  ready: "LIVE",
  error: "ERROR",
};

// Renders an instant, no-deploy live preview of a selected repo/branch: fetches
// the repo's files, boots a @webcontainer/api runtime in the browser, runs its
// npm install + dev/start script, and shows the resulting dev server in an
// iframe. See ADR-0006 for why this is a separate surface from the job-based
// PreviewPanel.
export default function WebContainersPreview({ owner, repo, branch }) {
  const [stage, setStage] = useState("idle"); // idle | fetching | booting | installing | starting | ready | error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [logTail, setLogTail] = useState("");
  const devProcessRef = useRef(null);

  useEffect(() => {
    if (!owner || !repo || !branch) {
      setStage("idle");
      return undefined;
    }

    let cancelled = false;
    setStage("fetching");
    setError(null);
    setPreviewUrl(null);
    setLogTail("");

    const appendLog = (chunk) => {
      if (cancelled) return;
      setLogTail((prev) => `${prev}${chunk}`.slice(-4000));
    };

    (async () => {
      try {
        if (!window.crossOriginIsolated) {
          throw new Error(
            "This page isn't cross-origin isolated, so the browser can't boot a WebContainer. Reload the page, or check that COOP/COEP response headers are configured for this deployment."
          );
        }

        const { files } = await BlairAPI.getRepoFiles(owner, repo, branch);
        if (cancelled) return;
        if (!files || Object.keys(files).length === 0) {
          throw new Error("No previewable files were found in this repo/branch.");
        }

        const startScript = pickStartScript(files);

        setStage("booting");
        await resetContainer();
        if (cancelled) return;
        containerPromise = WebContainer.boot();
        const instance = await containerPromise;
        if (cancelled) return;

        instance.on("server-ready", (_port, url) => {
          if (cancelled) return;
          setPreviewUrl(url);
          setStage("ready");
        });
        instance.on("error", (err) => {
          if (cancelled) return;
          setError(err?.message || "WebContainer runtime error.");
          setStage("error");
        });

        await instance.mount(toFileSystemTree(files));
        if (cancelled) return;

        setStage("installing");
        const installProcess = await instance.spawn("npm", ["install"]);
        installProcess.output.pipeTo(new WritableStream({ write: appendLog })).catch(() => {});
        const installExitCode = await installProcess.exit;
        if (cancelled) return;
        if (installExitCode !== 0) {
          throw new Error("npm install failed. See the log below for details.");
        }

        setStage("starting");
        const devProcess = await instance.spawn("npm", ["run", startScript]);
        if (cancelled) {
          devProcess.kill();
          return;
        }
        devProcessRef.current = devProcess;
        devProcess.output.pipeTo(new WritableStream({ write: appendLog })).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to start the WebContainers preview.");
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
      if (devProcessRef.current) {
        try {
          devProcessRef.current.kill();
        } catch {
          // Process may already have exited.
        }
        devProcessRef.current = null;
      }
    };
  }, [owner, repo, branch]);

  const isBusy = ["fetching", "booting", "installing", "starting"].includes(stage);
  const hasRepo = !!(owner && repo && branch);

  return (
    <div className="bg-tfrs-surface border border-tfrs-border flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-tfrs-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MonitorPlay className="w-4 h-4 text-tfrs-gold shrink-0" />
          <span className="text-sm font-mono font-bold uppercase tracking-wide text-tfrs-text truncate">
            Instant Repo Preview
          </span>
          {hasRepo && (
            <span className="flex items-center gap-1.5 text-xs font-mono uppercase text-tfrs-muted ml-2 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[stage] || "bg-tfrs-muted"}`} />
              {STATUS_LABEL[stage] || stage.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-black/40 min-h-0">
        {!hasRepo && (
          <div className="absolute inset-0 flex items-center justify-center text-tfrs-muted font-mono text-sm text-center px-6">
            Select a repository and branch to load a live, interactive preview.
          </div>
        )}

        {hasRepo && isBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-tfrs-muted font-mono text-sm px-6">
            <Loader2 className="w-6 h-6 animate-spin text-tfrs-red" />
            <span>{STAGE_LABEL[stage]}</span>
            {logTail && (
              <div className="w-full max-w-md bg-black/40 border border-tfrs-border p-2 h-24 overflow-y-auto font-mono text-[10px] text-tfrs-muted whitespace-pre-wrap">
                {logTail}
              </div>
            )}
          </div>
        )}

        {hasRepo && stage === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-tfrs-red font-mono text-sm text-center px-6">
            <AlertTriangle className="w-6 h-6" />
            <span>{error || "Preview is unavailable for this repo."}</span>
          </div>
        )}

        {hasRepo && stage === "ready" && previewUrl && (
          <iframe
            src={previewUrl}
            title="WebContainers live repo preview"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
