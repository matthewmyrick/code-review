// Shown when a PR has merge conflicts: kick off an agent run that
// analyzes both sides of the conflict and opens a local general-comment
// discussion (reply there to keep talking to the agent).

import { GitPullRequestArrow } from "lucide-react";
import { useState } from "react";

import { ipc } from "../lib/ipc";
import type { PullRequest } from "../lib/types";
import { useAppStore } from "../state/store";
import { pushGithubError, pushInfo } from "../state/toasts";
import { Button, Spinner } from "./ui";

export function ConflictHelper({ pr }: { pr: PullRequest }) {
  const specs = useAppStore((s) => s.agentSpecs);
  const runs = useAppStore((s) => s.runs);
  const [agent, setAgent] = useState("");
  const [working, setWorking] = useState(false);

  if (pr.mergeable_state !== "dirty" || specs.length === 0) return null;
  const agentName = agent || (specs[0]?.name ?? "");
  const repo = `${pr.repo.owner}/${pr.repo.name}`;
  // One conflict analysis at a time — no piling up five runs on the
  // same conflict.
  const alreadyRunning = runs.some(
    (r) => r.purpose === "conflict analysis" && (r.status === "starting" || r.status === "running"),
  );

  const start = () => {
    setWorking(true);
    void ipc
      .startConflictResolution(agentName, repo, pr.number)
      .then(() => {
        pushInfo(`${agentName} is analyzing the conflicts — a discussion will open in comments`);
      })
      .catch((e: unknown) => {
        pushGithubError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setWorking(false);
      });
  };

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-ember/30 bg-ember/5 px-3 py-2">
      <span className="text-[11px] text-ember">merge conflicts —</span>
      {specs.length > 1 ? (
        <select
          value={agentName}
          onChange={(e) => {
            setAgent(e.target.value);
          }}
          className="rounded-md border border-edge bg-ground px-1.5 py-0.5 text-[11px] text-cream"
        >
          {specs.map((spec) => (
            <option key={spec.name} value={spec.name}>
              {spec.name}
            </option>
          ))}
        </select>
      ) : null}
      {working ? (
        <Spinner label="starting analysis…" />
      ) : alreadyRunning ? (
        <Spinner label="analysis in progress — discussion will open in comments" />
      ) : (
        <Button onClick={start} disabled={!agentName}>
          <GitPullRequestArrow size={11} /> resolve with agent
        </Button>
      )}
      <span className="ml-auto text-[10px] text-muted">
        opens a local discussion — nothing touches the branch
      </span>
    </div>
  );
}
