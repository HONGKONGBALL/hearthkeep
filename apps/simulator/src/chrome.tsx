import { useEffect, useRef } from "react";
import { DATA_NOTICE, FICTIONAL_CHIP, WELCOME_BODY, WELCOME_TITLE } from "./ui-copy";

export function WelcomeOverlay({ onStart }: { onStart: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      const focusable = [...sheet.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
        (node) => !node.hasAttribute("disabled"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    sheet.addEventListener("keydown", onKeyDown);
    return () => sheet.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="overlay">
      <div
        ref={sheetRef}
        className="sheet welcome-sheet"
        role="dialog"
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
