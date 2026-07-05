import { describe, it, expect } from "vitest";
import { JOB_PHASES, jobPhaseState, jobHasFailed } from "./jobPhases";

const phaseByKey = (key) => JOB_PHASES.find((p) => p.key === key);

describe("jobPhases", () => {
  it("declares the six canonical lifecycle phases in order", () => {
    expect(JOB_PHASES.map((p) => p.label)).toEqual(["Define", "Plan", "Build", "Verify", "Review", "Ship"]);
  });

  it("marks every phase pending when there is no job", () => {
    expect(jobPhaseState(null, phaseByKey("plan"))).toBe("pending");
  });

  it("marks the phase matching the job's status as active", () => {
    const job = { status: "building" };
    expect(jobPhaseState(job, phaseByKey("plan"))).toBe("complete");
    expect(jobPhaseState(job, phaseByKey("build"))).toBe("active");
    expect(jobPhaseState(job, phaseByKey("verify"))).toBe("pending");
  });

  it("treats qa and preview statuses as the Verify phase", () => {
    expect(jobPhaseState({ status: "qa" }, phaseByKey("verify"))).toBe("active");
    expect(jobPhaseState({ status: "preview" }, phaseByKey("verify"))).toBe("active");
  });

  it("marks queued jobs as in the Define phase", () => {
    expect(jobPhaseState({ status: "queued" }, phaseByKey("define"))).toBe("active");
  });

  it("marks pr_opened and shipped as the Ship phase, complete once shipped", () => {
    expect(jobPhaseState({ status: "pr_opened" }, phaseByKey("ship"))).toBe("active");
    expect(jobPhaseState({ status: "shipped" }, phaseByKey("ship"))).toBe("active");
    expect(jobPhaseState({ status: "shipped" }, phaseByKey("review"))).toBe("complete");
  });

  it("reports every phase pending once a job has failed or was cancelled", () => {
    const failed = { status: "failed" };
    expect(jobPhaseState(failed, phaseByKey("build"))).toBe("pending");
    expect(jobHasFailed(failed)).toBe(true);
    expect(jobHasFailed({ status: "cancelled" })).toBe(true);
    expect(jobHasFailed({ status: "building" })).toBe(false);
    expect(jobHasFailed(null)).toBe(false);
  });
});
