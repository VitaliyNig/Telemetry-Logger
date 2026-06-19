import type { ReactNode } from "react";

export type PopoverPlacement = "bottom-start" | "bottom-end";

export interface PopoverProps {
  /** Usually a small icon button, e.g. the event-filter toggle. */
  trigger: ReactNode;
  open: boolean;
  placement?: PopoverPlacement;
  children?: ReactNode;
  className?: string;
}

/**
 * Anchored dropdown panel. Mirrors `.event-filter-toggle` + `.event-filter-panel`
 * (Events widget) and `.pit-times-toggle` — a small toggle button that reveals
 * a dark floating panel. The app positions the panel with `position: fixed` and
 * JS-measured coordinates; here it's anchored via a relative wrapper instead,
 * which keeps the same visual chrome without needing portal/measurement logic.
 */
export function Popover({ trigger, open, placement = "bottom-start", children, className }: PopoverProps) {
  return (
    <span className="popover-anchor">
      {trigger}
      {open && (
        <div className={["popover-panel", `popover-${placement}`, className ?? ""].filter(Boolean).join(" ")}>
          {children}
        </div>
      )}
    </span>
  );
}
