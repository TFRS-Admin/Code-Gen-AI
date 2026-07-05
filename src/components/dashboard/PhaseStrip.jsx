import React from "react";
import { CheckCircle2, Circle, ChevronRight, Loader2, XCircle } from "lucide-react";
import { JOB_PHASES, jobPhaseState, jobHasFailed } from "@/lib/jobPhases";

// Define → Plan → Build → Verify → Review → Ship. Shows where a job is in
// the Blair Agent Lifecycle. Used by both RightPanel's timeline strip and
// ChatInterface's inline job-status messages, so the two surfaces never
// disagree about what "the current phase" is.
export default function PhaseStrip({ job, className = "" }) {
  const failed = jobHasFailed(job);

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {JOB_PHASES.map((phase, i) => {
        const state = jobPhaseState(job, phase);
        return (
          <React.Fragment key={phase.key}>
            {i > 0 && <ChevronRight className="w-3 h-3 text-blair-muted/60 shrink-0" />}
            <div className="flex items-center gap-1 shrink-0">
              {state === "complete" && <CheckCircle2 className="w-3.5 h-3.5 text-blair-primary" />}
              {state === "active" && <Loader2 className="w-3.5 h-3.5 text-blair-primary animate-spin" />}
              {state === "pending" && <Circle className="w-3.5 h-3.5 text-blair-muted" />}
              <span className={`text-[11px] font-medium ${state === "pending" ? "text-blair-muted" : "text-blair-text"}`}>
                {phase.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
      {failed && (
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          <XCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-[11px] font-medium text-red-500">Failed</span>
        </div>
      )}
    </div>
  );
}
