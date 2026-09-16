// Textarea with @agent autocomplete: typing "@" pops a picker of the
// configured agents; selecting inserts "@name ". Mentions are how you
// summon an agent into a thread it didn't start.

import { Bot, Loader, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { ipc } from "../lib/ipc";
import { useAppStore } from "../state/store";

/** Agent names @mentioned in a body, deduped, limited to known specs. */
export function extractMentions(text: string, agentNames: string[]): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/@([\w.-]+)/g)) {
    const name = match[1] ?? "";
    if (agentNames.includes(name)) found.add(name);
  }
  return [...found];
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  onCancel?: () => void;
  mono?: boolean;
}

/** The "@token" being typed at the caret, if any. */
function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([\w.-]*)$/.exec(before);
  if (!match) return null;
  return { start: caret - (match[2]?.length ?? 0) - 1, query: match[2] ?? "" };
}

export function MentionInput(props: MentionInputProps) {
  const specs = useAppStore((s) => s.agentSpecs);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [polishing, setPolishing] = useState(false);

  const polish = () => {
    if (!props.value.trim() || polishing) return;
    setPolishing(true);
    ipc
      .polishText(props.value)
      .then((fixed) => {
        props.onChange(fixed);
      })
      .catch((e: unknown) => {
        console.error("polish failed", e);
      })
      .finally(() => {
        setPolishing(false);
      });
  };

  const suggestions = mention
    ? specs.filter((s) => s.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : [];

  const refresh = () => {
    const el = ref.current;
    if (!el) return;
    setMention(activeMention(el.value, el.selectionStart));
    setHighlight(0);
  };

  const insert = (name: string) => {
    const el = ref.current;
    if (!el || !mention) return;
    const caret = el.selectionStart;
    const next = `${props.value.slice(0, mention.start)}@${name} ${props.value.slice(caret)}`;
    props.onChange(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = mention.start + name.length + 2;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        autoFocus
        value={props.value}
        onChange={(e) => {
          props.onChange(e.target.value);
          requestAnimationFrame(refresh);
        }}
        onKeyUp={refresh}
        onClick={refresh}
        onKeyDown={(e) => {
          if (mention && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const pick = suggestions[highlight] ?? suggestions[0];
              if (pick) insert(pick.name);
              return;
            }
            if (e.key === "Escape") {
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSubmit?.();
          if (e.key === "Escape") props.onCancel?.();
        }}
        placeholder={props.placeholder}
        className={`min-h-16 w-full resize-y rounded-md border border-edge bg-ground p-2 pr-8 text-xs text-cream outline-none focus:border-sky ${
          props.mono ? "font-mono" : ""
        }`}
      />
      <button
        type="button"
        onClick={polish}
        disabled={polishing || !props.value.trim()}
        title="polish — fix typos & grammar with AI (never touches code or @mentions)"
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-amber disabled:pointer-events-none disabled:opacity-30"
      >
        {polishing ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
      </button>
      {mention && suggestions.length > 0 ? (
        <div className="animate-fade-in absolute left-2 top-full z-50 -mt-1 w-56 overflow-hidden rounded-lg border border-edge bg-panel shadow-xl">
          {suggestions.map((spec, i) => (
            <button
              key={spec.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insert(spec.name);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
                i === highlight ? "bg-sky/15 text-cream" : "text-muted hover:bg-panel-2"
              }`}
            >
              <Bot size={12} />
              <span className="font-medium">{spec.name}</span>
              <span className="ml-auto truncate text-[10px] opacity-70">{spec.runner.kind}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
