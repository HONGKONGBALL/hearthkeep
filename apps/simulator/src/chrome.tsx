import { useLayoutEffect, useRef } from "react";
import { DATA_NOTICE, FICTIONAL_CHIP, WELCOME_BODY, WELCOME_TITLE } from "./ui-copy";

const TABBABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function tabbableIn(sheet: HTMLElement): HTMLElement[] {
  return [...sheet.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (node) => node.tabIndex >= 0 && node.getClientRects().length > 0,
  );
}

export function WelcomeOverlay({ onStart }: { onStart: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const contain = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const items = tabbableIn(sheet);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && sheet.contains(active);
      if (!first || !last) {
        event.preventDefault();
        sheet.focus();
        return;
      }
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture on document: a listener on the dialog misses Tab once focus has left it.
    const pullBack = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Node && sheet.contains(target)) return;
      const items = tabbableIn(sheet);
      (items[0] ?? sheet).focus();
    };
    document.addEventListener("keydown", contain, true);
    document.addEventListener("focusin", pullBack);
    startRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", contain, true);
      document.removeEventListener("focusin", pullBack);
    };
  }, []);

  return (
    <div className="overlay">
      <div
        ref={sheetRef}
        className="sheet welcome-sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-copy"
      >
        <h2 id="welcome-title">{WELCOME_TITLE}</h2>
        <p id="welcome-copy">{WELCOME_BODY}</p>
        <p className="chip">{FICTIONAL_CHIP}</p>
        <p>{DATA_NOTICE}</p>
        <button ref={startRef} className="start" type="button" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}

export function CodeLock() {
  return (
    <span className="lock" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <path
          fill="currentColor"
          d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"
        />
      </svg>
    </span>
  );
}
