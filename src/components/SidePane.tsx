// Collapsible side pane with a persistent slim rail (never fully gone).
// Unpinned: hovering the rail slides the pane out as an overlay; the pin
// button freezes it back into the layout. The rail also hosts status
// icons (e.g. a pulsing dot while an agent runs).

import { Pin, PinOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

interface SidePaneProps {
  side: "left" | "right";
  pinned: boolean;
  onTogglePin: () => void;
  /** Icons shown on the rail (status indicators, counts). */
  rail: ReactNode;
  /** Tailwind width class for the pane, e.g. "w-72". */
  widthClass: string;
  children: ReactNode;
}

export function SidePane(props: SidePaneProps) {
  const [hovering, setHovering] = useState(false);
  const isLeft = props.side === "left";
  const borderClass = isLeft ? "border-r border-edge" : "border-l border-edge";

  const rail = (
    <div
      onMouseEnter={() => {
        setHovering(true);
      }}
      className={`flex h-full w-9 shrink-0 flex-col items-center gap-3 bg-panel py-3 ${borderClass}`}
    >
      <div className="flex flex-col items-center gap-3 text-muted">{props.rail}</div>
      <button
        type="button"
        onClick={props.onTogglePin}
        title={props.pinned ? "unpin — pane shows on hover" : "pin pane open"}
        className="mt-auto inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-cream"
      >
        {props.pinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
    </div>
  );

  const pane = (
    <div className={`h-full overflow-hidden bg-panel ${props.widthClass} ${borderClass}`}>
      {props.children}
    </div>
  );

  if (props.pinned) {
    return (
      <div className={`flex h-full shrink-0 ${isLeft ? "" : "flex-row-reverse"}`}>
        {rail}
        {pane}
      </div>
    );
  }

  return (
    <div
      className="relative h-full shrink-0"
      onMouseLeave={() => {
        setHovering(false);
      }}
    >
      {rail}
      {hovering ? (
        <div
          className={`animate-fade-in absolute top-0 z-30 h-full shadow-2xl ${
            isLeft ? "left-full" : "right-full"
          }`}
        >
          {pane}
        </div>
      ) : null}
    </div>
  );
}
