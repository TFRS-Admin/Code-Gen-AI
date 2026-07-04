import React, { useState, useEffect } from "react";
import { BlairAPI } from "@/api/blair";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, CircleCheck, CircleX } from "lucide-react";
import schemaRegistryRaw from "../../contracts/tfrs-schema-registry.md?raw";

const GITHUB_TOKEN_KEY = "blair_github_token";
const GITHUB_ORG_KEY = "blair_github_org";

function parseSchemaRegistry(md) {
  const lines = md.split("\n");
  const entities = [];
  let current = null;
  let inCoreSection = false;
  let inCodeBlock = false;
  let codeLines = [];

  const flush = () => {
    if (current) {
      current.code = codeLines.join("\n").trim();
      entities.push(current);
    }
  };

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      flush();
      current = null;
      inCoreSection = line.trim() === "## Core Entities";
      continue;
    }
    if (!inCoreSection) continue;
    if (/^###\s/.test(line)) {
      flush();
      current = { name: line.replace(/^###\s/, "").trim() };
      codeLines = [];
      inCodeBlock = false;
      continue;
    }
    if (current) {
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) codeLines.push(line);
    }
  }
  flush();
  return entities;
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-tfrs-surface border border-tfrs-border p-6 space-y-4">
      <h2 className="text-sm font-mono uppercase tracking-wide text-tfrs-gold">{title}</h2>
      {children}
    </div>
  );
}

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [githubToken, setGithubToken] = useState("");
  const [githubOrg, setGithubOrg] = useState("");
  const [saved, setSaved] = useState(false);
  const [openEntity, setOpenEntity] = useState(null);

  const entities = React.useMemo(() => parseSchemaRegistry(schemaRegistryRaw), []);

  useEffect(() => {
    setGithubToken(localStorage.getItem(GITHUB_TOKEN_KEY) || "");
    setGithubOrg(localStorage.getItem(GITHUB_ORG_KEY) || "");
    BlairAPI.getHealth()
      .then(setHealth)
      .catch((err) => setHealthError(err.message));
  }, []);

  const saveGithubConfig = () => {
    localStorage.setItem(GITHUB_TOKEN_KEY, githubToken);
    localStorage.setItem(GITHUB_ORG_KEY, githubOrg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text">Settings</h1>
        <p className="text-sm text-tfrs-muted mt-1">Provider, GitHub, and schema registry configuration.</p>
      </div>

      <SectionCard title="Provider Configuration">
        {healthError ? (
          <div className="flex items-center gap-2 text-tfrs-red font-mono text-sm">
            <CircleX className="w-4 h-4" />
            Server unreachable: {healthError}
          </div>
        ) : health ? (
          <div className="grid grid-cols-2 gap-4 font-mono text-sm">
            <div>
              <p className="text-xs text-tfrs-muted uppercase">Status</p>
              <div className="flex items-center gap-2 mt-1">
                <CircleCheck className="w-4 h-4 text-tfrs-gold" />
                <span className="text-tfrs-text">{health.status}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-tfrs-muted uppercase">Active Provider</p>
              <Badge className="bg-tfrs-red text-tfrs-text border-none rounded-none mt-1">{health.provider}</Badge>
            </div>
            <div>
              <p className="text-xs text-tfrs-muted uppercase">Version</p>
              <p className="text-tfrs-text mt-1">{health.version}</p>
            </div>
            <div>
              <p className="text-xs text-tfrs-muted uppercase">Uptime</p>
              <p className="text-tfrs-text mt-1">{Math.floor(health.uptime)}s</p>
            </div>
          </div>
        ) : (
          <p className="text-tfrs-muted font-mono text-sm">Checking server...</p>
        )}
      </SectionCard>

      <SectionCard title="GitHub Configuration">
        <div className="space-y-2">
          <Label className="text-tfrs-muted text-xs font-mono uppercase">GITHUB_TOKEN</Label>
          <Input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_..."
            className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-tfrs-muted text-xs font-mono uppercase">GITHUB_ORG</Label>
          <Input
            value={githubOrg}
            onChange={(e) => setGithubOrg(e.target.value)}
            placeholder="TFRS-Admin"
            className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono"
          />
        </div>
        <Button
          onClick={saveGithubConfig}
          className="bg-tfrs-red hover:bg-tfrs-red/90 text-tfrs-text font-mono uppercase rounded-none"
        >
          {saved ? "Saved" : "Save"}
        </Button>
        <p className="text-xs text-tfrs-muted">
          These values are stored in this browser's localStorage for local development only. For production,
          set <code className="text-tfrs-gold">GITHUB_TOKEN</code> and <code className="text-tfrs-gold">GITHUB_ORG</code> as
          Railway environment variables on the server service — they are never sent from the browser to GitHub directly.
        </p>
      </SectionCard>

      <SectionCard title="Schema Registry">
        <p className="text-xs text-tfrs-muted">
          Canonical TFRS entities. Blair cross-references these before inventing new data models.
        </p>
        <div className="divide-y divide-tfrs-border border border-tfrs-border">
          {entities.map((entity) => (
            <Collapsible
              key={entity.name}
              open={openEntity === entity.name}
              onOpenChange={(open) => setOpenEntity(open ? entity.name : null)}
            >
              <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-left font-mono text-sm text-tfrs-text hover:bg-black/20">
                {entity.name}
                <ChevronDown
                  className={`w-4 h-4 text-tfrs-muted transition-transform ${openEntity === entity.name ? "rotate-180" : ""}`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="px-4 pb-4 text-xs font-mono text-tfrs-muted whitespace-pre-wrap">{entity.code}</pre>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="About">
        <div className="font-mono text-sm space-y-2">
          <p className="text-tfrs-text">Blair v1.0.0</p>
          <p>
            <a
              href="https://github.com/TFRS-Admin/Code-Gen-AI"
              target="_blank"
              rel="noreferrer"
              className="text-tfrs-gold hover:underline"
            >
              github.com/TFRS-Admin/Code-Gen-AI
            </a>
          </p>
          <p className="text-tfrs-muted text-xs">
            Documentation: <span className="text-tfrs-text">prompts/blair-system-prompt.md</span>,{" "}
            <span className="text-tfrs-text">contracts/tfrs-schema-registry.md</span>
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
