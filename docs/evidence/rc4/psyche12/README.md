# rc4-psyche12 video evidence

Video: docs/demo/hearthkeep-demo.mp4, 142.160 s, 5518104 bytes, sha256 d25bda43911fa12db00a74ae7da888303be8775f26cf3897089e90a0cce16b26, md5 db0e310fbf5694cb1f52d86b0f04569e.

Re-rendered from the uncaptioned original page recording (the rc4-psyche8 take, 170 s), not trimmed from the captioned file. Same cut as rc4-psyche11 (kept 0-5.5, 11.8-33, 39-64, 80-96.5, 104.5-125, 131.5-141 and 145.5-170 s; holds of 7.64 s at 45.0 s, 4.08 s at 110.0 s and 5.54 s at 135.9 s) plus the E1 hold: the trace raw JSON (frame at 151.95 s) for 2.2 s after 152.0 s, so E1 (120.96-123.84) ends before the MIT license card appears at 124.17. Same 22 narration audio files as rc4-psyche11 (L1-L9 from the rc4-psyche8 mix, 13 extra lines). The audio track decodes to the same samples as the E1 standby cut (ffmpeg `-map 0:a -f md5` 029921251194f645735760b819f0823c), so asr-faster-whisper-small.txt (made on that cut) still applies.

Captions: after the cut, all 22 spoken lines get their own burned-in caption (same style as scripts/video-script.mjs, BorderStyle 3 opaque box), each from the line's start until its audio ends plus 0.4 s, clipped at the next line's start. Captions are not held across other lines. The same 22 captions are docs/video/hearthkeep-demo.srt (cues.json lists them with ids).

Files:
- build-psyche12.py: the build (cut, holds, mix, captions); gap-lines.json (13 extra line texts from docs/video-script.md), style.ass (caption style header from captionsAss).
- a3-caption-contrast-22.txt, a3-contrast-22.py, a3-frames/: the A3 contrast method from psyche7-e523db1, run on the midpoint of each of the 22 captions. All 22 PASS; lowest median 18.41:1, worst sample 13.76:1.
- silencedetect.txt: `ffmpeg -i hearthkeep-demo.mp4 -af silencedetect=n=-35dB:d=1 -f null -`. Longest pause 4.68 s (40.05-44.73).
- asr-faster-whisper-small.txt: offline faster-whisper small transcript of the same audio.
