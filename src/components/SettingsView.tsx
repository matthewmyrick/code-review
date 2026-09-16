// Settings: GitHub auth (fully configurable), tracked repos, and agents.

import { useState } from "react";

import type { GithubAuth, Settings } from "../lib/types";
import { useAppStore } from "../state/store";
import { AgentEditor } from "./AgentEditor";
import { RepoBrowser } from "./RepoBrowser";
import { Button } from "./ui";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  if (!settings) return null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <GithubSection settings={settings} />
      <ReposSection settings={settings} />
      <AgentEditor />
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
