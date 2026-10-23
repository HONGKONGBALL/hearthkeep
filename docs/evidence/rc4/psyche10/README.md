# rc4-psyche10 video evidence

Video: docs/demo/hearthkeep-demo.mp4, 128.500 s, 5292852 bytes, sha256 93c76d3a45c2cb6478564dadb86ef77f8dea045c9525439913bc3c17176f9065, md5 d4ac3e2a5fcdae1d2c7eb9299a1be742.

Made from the rc4-psyche9 file (sha256 70fa9354...991f, 154 s): kept 0-5.5, 11.8-33, 39-80.5, 88.5-110.3 and 115.5-154 s of that file; re-encoded with libx264 veryfast crf 20, 30 fps. Ten more DashScope qwen3-tts-flash Cherry lines (A1, B1-B2, C1-C3, D1-D2, E1-E2 in docs/video-script.md) were mixed in before the cut. No new captions.

- silencedetect.txt: `ffmpeg -i hearthkeep-demo.mp4 -af silencedetect=n=-35dB:d=1 -f null -`. Longest pause 3.26 s (2.53-5.78).
- asr-faster-whisper-small.txt: offline faster-whisper small (int8, VAD, word timestamps) transcript. Spoken starts of L2-L9 are 0.06-0.11 s after their cue starts, the same lead-in the narration track already had.
