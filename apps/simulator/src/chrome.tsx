import { useLayoutEffect, useRef } from "react";
import { DATA_NOTICE, FICTIONAL_CHIP, SIMULATION_RIBBON, TRY_HINT, WELCOME_BODY, WELCOME_TITLE } from "./ui-copy";

const TABBABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function tabbableIn(sheet: HTMLElement): HTMLElement[] {
  return [...sheet.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (node) => node.tabIndex >= 0 && node.getClientRects().length > 0,
  );
}

const ICONS = {
  logo: ["M3.5 11 12 4l8.5 7", "M5.5 9.5V20h13V9.5", "M9 17.5c0-3.4 2.4-5.5 6-5.5 0 3.6-2.3 5.8-5.6 5.8", "M9 17.5l3.2-2.8"],
  plus: ["M12 5v14M5 12h14"],
  sunrise: ["M3 18h18", "M7 18a5 5 0 0 1 10 0", "M12 5v3M5.2 10.2l1.7 1.2M18.8 10.2l-1.7 1.2", "M9.5 21h5"],
  reset: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  info: ["M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0", "M12 11v5.5", "M12 7.8v.2"],
  arrow: ["M5 12h14M13 6l6 6-6 6"],
  doc: ["M7 3h7l4.5 4.5V21H7z", "M14 3v4.5h4.5M10 12.5h5.5M10 16h5.5"],
  sun: ["M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0", "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"],
  leaf: ["M5 19c0-8.2 5.2-13.5 14-13.5 0 9-5.4 14-13.2 14", "M5 19l7.5-7.5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  lock: ["M5 10.5h14v10H5z", "M8 10.5V8a4 4 0 0 1 8 0v2.5", "M12 14.5v2"],
} as const;

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Full ribbon string stays the text content. The first word picks up the lemon cap. */
export function Ribbon() {
  const space = SIMULATION_RIBBON.indexOf(" ");
  const head = space === -1 ? SIMULATION_RIBBON : SIMULATION_RIBBON.slice(0, space);
  const rest = space === -1 ? "" : SIMULATION_RIBBON.slice(space);
  return (
    <p className="ribbon">
      <b>{head}</b>
      <span>{rest}</span>
    </p>
  );
}

export function WelcomeOverlay({
  onStart,
  onAbout,
  clockLabel,
  serverDetail,
}: {
  onStart: () => void;
  onAbout: () => void;
  clockLabel: string;
  serverDetail: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const inAbout = (node: EventTarget | null): boolean =>
      node instanceof Element && node.closest(".about-sheet") !== null;
    const contain = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      if (inAbout(document.activeElement)) return;
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
      if (inAbout(target)) return;
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
    <div className="overlay welcome-overlay">
      <div
        ref={sheetRef}
        className="sheet welcome-sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-copy"
      >
        <div className="mleft">
          <div className="mtop">
            <Ribbon />
            <p className="fchip">
              <Icon name="doc" />
              {FICTIONAL_CHIP}
            </p>
          </div>
          <h2 id="welcome-title">{WELCOME_TITLE}</h2>
          <div className="facts">
            <div className="fact">
              <span className="bul" />
              <div>
                <h3>The display is simulated</h3>
                <p id="welcome-copy">{WELCOME_BODY}</p>
              </div>
            </div>
            <div className="fact">
              <span className="bul" />
              <div>
                <h3>The MCP server is real</h3>
                <p>{serverDetail}</p>
              </div>
            </div>
            <div className="fact">
              <span className="bul" />
              <div>
                <h3>All data is fictional</h3>
                <p>{DATA_NOTICE}</p>
              </div>
            </div>
          </div>
          <div className="mfoot">
            <p className="when">
              Sim clock starts <b>{clockLabel}</b>
              <br />
              {TRY_HINT}
            </p>
            <button className="ghost" type="button" onClick={onAbout}>
              <Icon name="info" />
              About
            </button>
            <button ref={startRef} className="start" type="button" onClick={onStart}>
              Start
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <div className="mright" aria-hidden="true">
          <span className="eyebrow">How it reads your home</span>
          <div className="vit">
            <svg viewBox="0 0 300 300" width="300" height="300">
              <circle cx="150" cy="150" r="128" stroke="#DCE6CE" />
              <circle cx="150" cy="150" r="128" stroke="#1FA85B" strokeDasharray="563 805" />
              <circle cx="150" cy="150" r="102" stroke="#DCE6CE" />
              <circle cx="150" cy="150" r="102" stroke="#F2B705" strokeDasharray="641 641" />
              <circle cx="150" cy="150" r="76" stroke="#DCE6CE" />
              <circle cx="150" cy="150" r="76" stroke="#EE4258" strokeDasharray="478 478" />
              <circle cx="150" cy="150" r="76" stroke="#A3122A" strokeDasharray="42 478" />
            </svg>
            <div className="ctr">
              <div>
                <b>Rings</b>
                <span>
                  fill toward the
                  <br />
                  next job
                </span>
              </div>
            </div>
          </div>
          <div className="legend">
            <div>
              <i className="leaf" />
              On track
              <span>coming up</span>
            </div>
            <div>
              <i className="lemon" />
              Full ring
              <span>due today</span>
            </div>
            <div>
              <i className="berry" />
              Wrapped past the top
              <span>overdue</span>
            </div>
          </div>
          <p className="cap">
            Each appliance gets a ring that fills from the day it was last serviced to the day it is next due.
          </p>
        </div>
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
