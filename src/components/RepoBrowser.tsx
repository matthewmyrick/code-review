// Repo lookup for settings: pick an owner (you or one of your orgs),
// filter that owner's repos, and add them with a click — no slug typing.

import { Check, Lock, Plus, Search } from "lucide-react";
import { useState } from "react";

import { ipc } from "../lib/ipc";
import type { OwnerList, RepoSummary } from "../lib/types";
import { useAppStore } from "../state/store";
import { Button, Pill, Spinner } from "./ui";

export function RepoBrowser() {
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const [owners, setOwners] = useState<OwnerList | null>(null);
  const [owner, setOwner] = useState("");
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;

  const loadRepos = (list: OwnerList, pick: string) => {
    setOwner(pick);
    setRepos([]);
    setLoading(true);
    setError(null);
    ipc
      .listGithubRepos(pick, pick === list.viewer)
      .then(setRepos)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const open = () => {
    setLoading(true);
    setError(null);
    ipc
      .listGithubOwners()
      .then((list) => {
        setOwners(list);
        loadRepos(list, list.viewer);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  };

  if (!owners) {
    return (
      <div className="flex items-center gap-2">
        <Button onClick={open} disabled={loading}>
          <Search size={11} /> browse github
        </Button>
        {loading ? <Spinner label="loading your orgs…" /> : null}
        {error ? <span className="text-[11px] text-ember">{error}</span> : null}
      </div>
    );
  }

  const visible = repos.filter((r) =>
    r.full_name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-edge bg-ground/60 p-2.5">
      <div className="flex gap-2">
        <select
          value={owner}
          onChange={(e) => {
            loadRepos(owners, e.target.value);
          }}
          className="rounded-md border border-edge bg-panel-2 px-2 py-1.5 text-xs text-cream"
        >
          <option value={owners.viewer}>{owners.viewer} (you)</option>
          {owners.orgs.map((org) => (
            <option key={org} value={org}>
              {org}
            </option>
          ))}
        </select>
        <input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
          placeholder="filter repos…"
          className="min-w-0 flex-1 rounded-md border border-edge bg-ground px-2 py-1.5 text-xs text-cream outline-none focus:border-sky"
        />
      </div>

      {error ? <div className="text-[11px] text-ember">{error}</div> : null}
      {loading ? <Spinner label="loading repos…" /> : null}

      <div className="max-h-56 overflow-y-auto rounded-md">
        {visible.map((repo) => {
          const added = settings.repos.includes(repo.full_name);
          return (
            <div
              key={repo.full_name}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-panel-2"
            >
              <span className="truncate font-mono text-cream">{repo.full_name}</span>
              {repo.private ? (
                <Pill tone="muted">
                  <Lock size={9} /> private
                </Pill>
              ) : null}
              {repo.description ? (
                <span className="hidden truncate text-[10px] text-muted sm:inline">
                  {repo.description}
                </span>
              ) : null}
              <span className="ml-auto shrink-0">
                {added ? (
                  <Pill tone="moss">
                    <Check size={10} /> added
                  </Pill>
                ) : (
                  <Button
                    onClick={() => {
                      void saveSettings({
                        ...settings,
                        repos: [...settings.repos, repo.full_name],
                      });
                    }}
                  >
                    <Plus size={11} /> add
                  </Button>
                )}
              </span>
            </div>
          );
        })}
        {!loading && visible.length === 0 ? (
          <div className="px-2 py-3 text-center text-[11px] text-muted">no repos match</div>
        ) : null}
      </div>
    </div>
  );
}
