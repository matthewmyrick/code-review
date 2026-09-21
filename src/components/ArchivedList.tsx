// Recently merged PRs held in the 3-day archive before purge.

import { Archive } from "lucide-react";

import type { ArchivedPr } from "../lib/types";
import { useAppStore } from "../state/store";
import { Pill } from "./ui";

/** Days until the archive purge deadline (ceil, min 0). */
function daysLeft(purgeAfter: string): number {
  const ms = new Date(purgeAfter).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function ArchivedList() {
  const archived = useAppStore((s) => s.archivedPrs);
  const selectPr = useAppStore((s) => s.selectPr);
  if (archived.length === 0) return null;
  return (
    <details className="border-t border-edge/60 px-2 py-2" open>
      <summary className="flex cursor-pointer items-center gap-1.5 px-1 py-1 text-[11px] uppercase tracking-wide text-muted hover:text-cream">
        <Archive size={11} /> archived ({archived.length})
      </summary>
      <div className="mt-1 space-y-1">
        {archived.map((a) => (
          <ArchivedItem key={a.pull_request.number} archived={a} onOpen={selectPr} />
        ))}
      </div>
    </details>
  );
}

function ArchivedItem(props: { archived: ArchivedPr; onOpen: (n: number) => Promise<void> }) {
  const pr = props.archived.pull_request;
  const days = daysLeft(props.archived.purge_after);
  return (
    <button
      type="button"
      onClick={() => {
        void props.onOpen(pr.number);
      }}
      className="block w-full rounded-lg border border-transparent px-3 py-2 text-left opacity-80 transition-all hover:border-edge hover:bg-panel-2/60 hover:opacity-100"
    >
      <div className="mb-0.5 flex items-center gap-2">
        <span className="text-xs font-medium text-fur">#{pr.number}</span>
        <Pill tone="muted">merged</Pill>
        <span className="ml-auto text-[10px] text-muted">
          {days === 0 ? "purges today" : `purges in ${String(days)}d`}
        </span>
      </div>
      <div className="line-clamp-1 text-[12px] text-cream/80">{pr.title}</div>
    </button>
  );
}
