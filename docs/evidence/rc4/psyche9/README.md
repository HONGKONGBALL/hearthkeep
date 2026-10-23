# rc4-psyche9 video evidence

Video: docs/demo/hearthkeep-demo.mp4, 154.000 s, 4507161 bytes, sha256 70fa9354012e4e2c8431764d07434aa78b28a775f16962b8aced6aece482991f, md5 7ce326e0ee983f3a52645e62f56ee9ff.

Made from the rc4-psyche8 file (sha256 34b18f53...7ed7): picture and audio 0-64 s and 80-170 s kept, 64-80 s (static trace view) removed, video re-encoded with libx264 veryfast crf 20, 30 fps. Three DashScope qwen3-tts-flash Cherry lines (G1-G3 in docs/video-script.md) mixed in at 44.8, 53.0 and 58.0 s. No new captions.

- silencedetect.txt: `ffmpeg -i hearthkeep-demo.mp4 -af silencedetect=n=-35dB:d=1 -f null -`. The 44.6-80.1 s gap of rc4-psyche8 is gone; the longest pause from 40 to 64 s is 1.08 s. Pauses longer than 5 s in other shots (L1, L3, L5-L8) were already in rc4-psyche8 and are unchanged.
- asr-faster-whisper-small.txt: offline faster-whisper small (int8, VAD) transcript of the new file. Segment starts match the cue starts 64/89/116/131/146.
