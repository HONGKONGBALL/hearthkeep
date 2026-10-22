/**
 * One follow-up utterance while a turn is already running.
 * Card taps stay in this slot until that turn finishes. A later tap replaces it.
 */
export function acceptUtterance(
  busy: boolean,
  pending: string | null,
  utterance: string,
): { pending: string | null; start: string | null } {
  const text = utterance.trim();
  if (text === "") return { pending, start: null };
  if (busy) return { pending: text, start: null };
  return { pending: null, start: text };
}

export function nextIntent(pending: string | null): string | null {
  if (pending === null) return null;
  const text = pending.trim();
  return text === "" ? null : text;
}

/**
 * srcdoc reloads can replace contentWindow before the previous document's
 * postMessage arrives. The window that just unloaded is still this card frame.
 */
export function rememberCardWindow<T>(
  live: T | null,
  previous: T | null,
  next: T | null,
): { live: T | null; previous: T | null } {
  if (next === null || next === live) return { live, previous };
  return { live: next, previous: live };
}

/** True when the message source is the iframe's current window or the one a reload just replaced. */
export function isCardFrameSource(source: unknown, live: unknown, previous: unknown): boolean {
  if (source == null) return false;
  if (live != null && source === live) return true;
  return previous != null && source === previous;
}
