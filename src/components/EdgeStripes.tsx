// Stacked status stripes on the left edge of PR cards — green (ready),
// red (checks failing), amber (unresolved review threads) — plus a
// hover tip listing exactly which checks are failing.

import { useState } from "react";

import { ipc } from "../lib/ipc";
import { checksFailing, isReadyToMerge } from "../lib/ready";
import type { PullRequest } from "../lib/types";

export function EdgeStripes({ pr }: { pr: PullRequest }) {
  const stripes = [
    isReadyToMerge(pr) ? "bg-moss" : null,
    checksFailing(pr) ? "bg-ember" : null,
    pr.unresolved_threads > 0 ? "bg-amber" : null,
  ].filter((c): c is string => c !== null);
  if (stripes.length === 0) return null;
  return (
    <span className="pointer-events-none absolute inset-y-0 left-0 flex">
      {stripes.map((cls) => (
        <span key={cls} className={`h-full w-[3px] ${cls}`} />
      ))}
    </span>
  );
}

const checkCache = new Map<string, string[]>();

interface Tip {
  x: number;
  y: number;
  names: string[] | null;
}

/** Row handlers + floating tip for failing-check details on hover. */
export function useFailingChecksTip(pr: PullRequest) {
  const [tip, setTip] = useState<Tip | null>(null);
  const slug = `${pr.repo.owner}/${pr.repo.name}`;
  const key = `${slug}#${String(pr.number)}@${pr.head_sha}`;

  const onMouseEnter = (e: React.MouseEvent) => {
    if (!checksFailing(pr)) return;
    const cached = checkCache.get(key);
    setTip({ x: e.clientX, y: e.clientY, names: cached ?? null });
    if (!cached) {
      ipc
        .listFailingChecks(slug, pr.number)
        .then((names) => {
          checkCache.set(key, names);
          setTip((t) => (t ? { ...t, names } : t));
        })
        .catch(console.warn);
    }
  };
  const onMouseLeave = () => {
    setTip(null);
  };

  const tipEl = tip ? (
    <div
      className="animate-fade-in fixed z-[90] max-w-72 rounded-lg border border-ember/40 bg-panel px-3 py-2 text-left shadow-2xl"
      style={{ left: tip.x + 14, top: tip.y + 10 }}
    >
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ember">
        failing checks
      </div>
      {tip.names === null ? (
        <div className="text-[11px] text-muted">loading…</div>
      ) : tip.names.length === 0 ? (
        <div className="text-[11px] text-muted">rollup failed — no individual check names</div>
      ) : (
        <ul className="space-y-0.5 text-[11px] text-cream">
          {tip.names.slice(0, 8).map((name) => (
            <li key={name} className="truncate">
              {name}
            </li>
          ))}
          {tip.names.length > 8 ? (
            <li className="text-muted">+{tip.names.length - 8} more</li>
          ) : null}
        </ul>
      )}
    </div>
  ) : null;

  return { onMouseEnter, onMouseLeave, tipEl };
}
