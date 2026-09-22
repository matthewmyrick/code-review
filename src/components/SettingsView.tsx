// Settings: GitHub auth (fully configurable), tracked repos, and agents.

import { useEffect, useState } from "react";

import { ipc } from "../lib/ipc";
import { PR_SORTS } from "../lib/sort";
import type { FileConfigInfo, GithubAuth, PrFilters, Settings } from "../lib/types";
import { useAppStore } from "../state/store";
import { AgentEditor } from "./AgentEditor";
import { RepoBrowser } from "./RepoBrowser";
import { Button } from "./ui";
import { VersionSection } from "./VersionSection";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const [fileConfig, setFileConfig] = useState<FileConfigInfo | null>(null);

  useEffect(() => {
    ipc.fileConfigInfo().then(setFileConfig).catch(console.warn);
  }, []);

  if (!settings) return null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      {fileConfig ? (
        <div className="rounded-lg border border-sky/30 bg-sky/10 px-4 py-3 text-xs text-cream">
          <div className="font-medium">file config active</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">{fileConfig.path}</div>
          <div className="mt-1 text-muted">
            {fileConfig.agents} agent{fileConfig.agents === 1 ? "" : "s"} managed from file
            {fileConfig.overrides.length > 0
              ? ` · overrides: ${fileConfig.overrides.join(", ")}`
              : ""}{" "}
            — file values win over what's saved here
          </div>
        </div>
      ) : null}
      <GithubSection settings={settings} />
      <ReposSection settings={settings} />
      <FiltersSection settings={settings} />
      <AgentEditor />
      {/* Version manager stays the last section on this page. */}
      <VersionSection />
    </div>
  );
}

function Section(props: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel p-4">
      <h2 className="text-sm font-semibold text-cream">{props.title}</h2>
      {props.hint ? <p className="mt-0.5 text-xs text-muted">{props.hint}</p> : null}
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

const inputClass =
  "w-full rounded-md border border-edge bg-ground px-2 py-1.5 text-xs text-cream outline-none focus:border-sky";

function GithubSection({ settings }: { settings: Settings }) {
  const saveSettings = useAppStore((s) => s.saveSettings);
  const viewer = useAppStore((s) => s.viewer);
  const [authKind, setAuthKind] = useState(settings.github.auth.kind);
  const [token, setToken] = useState(
    settings.github.auth.kind === "token" ? settings.github.auth.token : "",
  );
  const [apiBase, setApiBase] = useState(settings.github.api_base);

  const save = () => {
    const auth: GithubAuth =
      authKind === "token"
        ? { kind: "token", token }
        : authKind === "anonymous"
          ? { kind: "anonymous" }
          : { kind: "gh_cli" };
    void saveSettings({ ...settings, github: { auth, api_base: apiBase } });
  };

  return (
    <Section
      title="GitHub authentication"
      hint="Choose how Tandem reads from GitHub. Tandem never writes to GitHub."
    >
      <div className="mb-2 text-xs text-cream">
        acting as GitHub user:{" "}
        {viewer ? (
          <span className="font-mono font-medium text-sky">{viewer}</span>
        ) : (
          <span className="text-ember">unknown — GitHub calls may be failing</span>
        )}
        <span className="ml-1 text-muted">
          (whoever your auth below resolves to — switch accounts with `gh auth login`)
        </span>
      </div>
      <div className="flex flex-col gap-2 text-xs text-cream">
        {(
          [
            ["gh_cli", "gh CLI session (reuses `gh auth login`)"],
            ["token", "personal access token"],
            ["anonymous", "anonymous (public repos, low rate limit)"],
          ] as const
        ).map(([kind, label]) => (
          <label key={kind} className="flex items-center gap-2">
            <input
              type="radio"
              name="gh-auth"
              checked={authKind === kind}
              onChange={() => {
                setAuthKind(kind);
              }}
            />
            {label}
          </label>
        ))}
        {authKind === "token" ? (
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
            }}
            placeholder="ghp_…"
            className={inputClass}
          />
        ) : null}
        <label className="mt-1 flex flex-col gap-1">
          <span className="text-muted">API base (GitHub Enterprise supported)</span>
          <input
            value={apiBase}
            onChange={(e) => {
              setApiBase(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        <div>
          <Button kind="primary" onClick={save}>
            save auth
          </Button>
        </div>
      </div>
    </Section>
  );
}

function FiltersSection({ settings }: { settings: Settings }) {
  const saveSettings = useAppStore((s) => s.saveSettings);
  const setRuntimeFilters = useAppStore((s) => s.setFilters);
  const setPrSort = useAppStore((s) => s.setPrSort);
  const [filters, setFilters] = useState<PrFilters>(settings.pr_filters);
  const [sort, setSort] = useState(settings.pr_sort);
  const [allRepos, setAllRepos] = useState(settings.inbox_all_repos);
  const patch = (p: Partial<PrFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
  };

  return (
    <Section
      title="Default PR view"
      hint="filters, ordering and inbox scope applied whenever you open a repo — adjustable in the sidebar anytime"
    >
      <div className="flex flex-col gap-2 text-xs">
        <div className="grid grid-cols-3 gap-2">
          <input
            value={filters.query}
            onChange={(e) => {
              patch({ query: e.target.value });
            }}
            placeholder="search text"
            className={inputClass}
          />
          <div className="flex gap-1">
            <input
              value={filters.author}
              onChange={(e) => {
                patch({ author: e.target.value });
              }}
              placeholder="author"
              className={inputClass}
            />
            <Button
              onClick={() => {
                void ipc
                  .listGithubOwners()
                  .then((o) => {
                    patch({ author: o.viewer });
                  })
                  .catch(console.warn);
              }}
              title="use your authenticated GitHub username"
            >
              me
            </Button>
          </div>
          <input
            value={filters.label}
            onChange={(e) => {
              patch({ label: e.target.value });
            }}
            placeholder="label"
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={filters.hide_drafts}
            onChange={(e) => {
              patch({ hide_drafts: e.target.checked });
            }}
          />
          hide draft PRs by default
        </label>
        <div className="grid grid-cols-2 items-center gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted">default sort order</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
              }}
              className={inputClass}
            >
              {PR_SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 flex items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={allRepos}
              onChange={(e) => {
                setAllRepos(e.target.checked);
              }}
            />
            start in the all-repositories view
          </label>
        </div>
        <div>
          <Button
            kind="primary"
            onClick={() => {
              void saveSettings({
                ...settings,
                pr_filters: filters,
                pr_sort: sort,
                inbox_all_repos: allRepos,
              });
              setRuntimeFilters(filters);
              setPrSort(sort as Parameters<typeof setPrSort>[0]);
            }}
          >
            save defaults
          </Button>
        </div>
      </div>
    </Section>
  );
}

function ReposSection({ settings }: { settings: Settings }) {
  const saveSettings = useAppStore((s) => s.saveSettings);
  const [slug, setSlug] = useState("");

  const add = () => {
    const trimmed = slug.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return;
    if (settings.repos.includes(trimmed)) return;
    void saveSettings({ ...settings, repos: [...settings.repos, trimmed] });
    setSlug("");
  };

  return (
    <Section title="Repositories" hint="browse your orgs or type an owner/name slug">
      <div className="flex flex-col gap-2">
        <RepoBrowser />
        {settings.repos.map((repo) => (
          <div
            key={repo}
            className="flex items-center justify-between rounded-md bg-panel-2 px-2 py-1.5 text-xs"
          >
            <span className="font-mono text-cream">{repo}</span>
            <Button
              kind="danger"
              onClick={() => {
                void saveSettings({
                  ...settings,
                  repos: settings.repos.filter((r) => r !== repo),
                });
              }}
            >
              remove
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="owner/name"
            className={inputClass}
          />
          <Button kind="primary" onClick={add}>
            add
          </Button>
        </div>
      </div>
    </Section>
  );
}
