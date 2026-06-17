import type { ReactNode } from "react";

export interface WidgetShellProps {
  /** Title shown in the header (rendered uppercase). */
  title: ReactNode;
  /** Optional widget id, surfaced as `data-widget-id` like the app does. */
  widgetId?: string;
  /** Extra header controls placed between the title and the close button. */
  headerExtra?: ReactNode;
  /** Show the drag handle glyph. Default true. */
  draggable?: boolean;
  /** Close handler; when omitted the close button is hidden. */
  onClose?: () => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Chrome for a dashboard widget: header with drag handle, title, optional
 * header controls and a close button, plus a scrollable body. Mirrors the
 * markup produced by `makeWidgetHtml` in the app.
 */
export function WidgetShell({
  title,
  widgetId,
  headerExtra,
  draggable = true,
  onClose,
  children,
  className,
}: WidgetShellProps) {
  return (
    <div
      className={["widget-wrapper", className ?? ""].filter(Boolean).join(" ")}
      data-widget-id={widgetId}
    >
      <div className="widget-header">
        {draggable && (
          <span className="widget-drag-handle" aria-hidden="true">
            ⠿
          </span>
        )}
        <span className="widget-header-title">{title}</span>
        {headerExtra}
        {onClose && (
          <button
            type="button"
            className="widget-close-btn"
            title="Remove widget"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
      <div className="widget-body">{children}</div>
    </div>
  );
}
