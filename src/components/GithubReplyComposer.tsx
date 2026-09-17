// Compose a reply that goes STRAIGHT to GitHub — no local thread.
// Still gated behind an explicit two-step confirm, like every write.

import { Loader, Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { ipc } from "../lib/ipc";
import { useAppStore } from "../state/store";
import { Button, Spinner } from "./ui";

interface GithubReplyComposerProps {
  /** Review-comment id to thread under; omit for a plain PR comment. */
  reviewCommentId?: number;
  onDone?: () => void;
}

export function GithubReplyComposer(props: GithubReplyComposerProps) {
  const bundle = useAppStore((s) => s.bundle);
  const refreshBundle = useAppStore((s) => s.refreshBundle);
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [polishing, setPolishing] = useState(false);

  if (!bundle) return null;
  const pr = bundle.detail.pull_request;

  const post = () => {
    setWorking(true);
    void ipc
      .replyOnGithub(
        `${pr.repo.owner}/${pr.repo.name}`,
        pr.number,
        body.trim(),
        props.reviewCommentId ?? null,
      )
      .then(async () => {
        setBody("");
        setConfirming(false);
        await refreshBundle();
        props.onDone?.();
      })
      .catch((e: unknown) => {
        console.error("github reply failed", e);
      })
      .finally(() => {
        setWorking(false);
      });
  };

  const polish = () => {
    if (!body.trim() || polishing) return;
    setPolishing(true);
    ipc
      .polishText(body)
      .then(setBody)
      .catch((e: unknown) => {
        console.error("polish failed", e);
      })
      .finally(() => {
        setPolishing(false);
      });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <textarea
          autoFocus
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setConfirming(false);
          }}
          placeholder="reply on github — markdown supported, posts under your account"
          className="min-h-20 w-full resize-y rounded-md border border-edge bg-ground p-2 pr-8 text-xs leading-relaxed text-cream outline-none focus:border-sky"
        />
        <button
          type="button"
          onClick={polish}
          disabled={polishing || !body.trim()}
          title="polish — fix typos & grammar with AI"
          className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-amber disabled:pointer-events-none disabled:opacity-30"
        >
          {polishing ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {working ? (
          <Spinner label="posting to github…" />
        ) : confirming ? (
          <>
            <Button kind="danger" onClick={post} title="this WILL post to GitHub">
              <Send size={11} /> confirm post
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
            >
              cancel
            </Button>
          </>
        ) : (
          <Button
            kind="primary"
            disabled={!body.trim()}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Send size={11} /> post reply to github
          </Button>
        )}
      </div>
    </div>
  );
}
