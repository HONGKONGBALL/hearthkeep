# rc4-psyche11 video evidence

Video: docs/demo/hearthkeep-demo.mp4, 139.960 s, 5338639 bytes, sha256 9f2faccf09d1581ecf6d26addbb7e1c9ae19244f82016e618b2736fbbdede101, md5 e7281a04f89e5b7686902d6dbc47279a.

Made from the original 170-second page recording (the rc4-psyche8 file): kept 0-5.5, 11.8-33, 39-64, 80-96.5, 104.5-125, 131.5-141 and 145.5-170 s, with three still-frame holds: the filter cards (frame at 45.0 s) for 7.64 s, the three openings (110.0 s) for 4.08 s and the new-session briefing (135.9 s) for 5.54 s. Re-encoded with libx264 veryfast crf 20, 30 fps. 10 added lines, 13 total with retained G1-G3 (DashScope qwen3-tts-flash Cherry, same audio files as rc4-psyche10), mixed in after the cut at the starts in docs/video-script.md. No new captions; during a hold the burned-in caption is held too.

Picture changes vs extra lines (frame difference, 0.1 s steps):
- G1 32.30-40.14; filter cards change to checkout at 40.5. G2 starts 44.64; receipt ord_0001 appears at 45.5.
- C1 80.34-85.22; three openings change to the over-limit checkout at 85.5.
- D1 104.72-110.16; new-session briefing changes to the gas reply at 110.5.

- silencedetect.txt: `ffmpeg -i hearthkeep-demo.mp4 -af silencedetect=n=-35dB:d=1 -f null -`. Longest pause 4.68 s (40.05-44.73).
- asr-faster-whisper-small.txt: offline faster-whisper small (int8, VAD, word timestamps) transcript.
