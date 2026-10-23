/** Types for scripts/video-script.mjs. */
export interface VideoCue {
  id: string;
  start: number;
  end: number;
  shot: string;
  narration: string;
}
export const SCRIPT_PATH: string;
export function parseVideoScript(markdown: string): VideoCue[];
export function assertCues(cues: VideoCue[]): VideoCue[];
export function loadCues(path?: string): VideoCue[];
export function assTime(seconds: number): string;
export function captionsAss(cues: VideoCue[]): string;
