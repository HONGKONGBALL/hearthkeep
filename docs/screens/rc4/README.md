# rc4 screenshots

Frames from the running simulator after the rc4 fixes. Household names, prices, and the purchase code on screen are fictional sample data. The verification record is `BUILD-RC4.txt`. Raw logs are in `docs/evidence/rc4/`.

Playwright does not write this directory. Specs save shots under `test-results/e2e-screens/`, which git ignores. The 768-wide files added for this set were taken with a fresh browser context at 768×1024, not by resizing a wider page.

| File | What it shows |
| --- | --- |
| `a1-1280-next-morning.png` | F5 status card (C1) at 1280. Order and task text sit on the wide column. |
| `a1-390-next-morning.png` | Same card at 390. |
| `a1-768-next-morning.png` | Same card at 768. |
| `a2-1280-hazard-turn.png` | Gas alert at 1280. Banner is up. No card. |
| `a2-1280-next-turn.png` | Next turn at 1280. Status card is back. Banner is gone. |
| `a2-390-hazard-turn.png` | Gas alert at 390. |
| `a2-390-next-turn.png` | Next turn at 390. |
| `a2-768-hazard-turn.png` | Gas alert at 768. Banner is up. No card. |
| `a2-768-next-turn.png` | Next turn at 768. Status card shows Needs attention. Banner is gone. |
| `a5-1280-task-open.png` | Task card (C5) open at 1280. |
| `a5-1280-task-done.png` | Same card completed at 1280. |
| `a5-390-task-open.png` | C5 open at 390. |
| `a5-390-task-done.png` | C5 completed at 390. |
| `a5-768-task-open.png` | C5 open at 768. Due, appliance, supplies, Mark done. |
| `a5-768-task-done.png` | C5 completed at 768. Next due reads October 2027. |
| `v1-390-f1.png` | Morning briefing at 390. Context created at that width. |
| `v1-390-f3.png` | Task card at 390. |
| `v1-390-f5.png` | F5 viewport at 390. |
| `v1-768-f1.png` | Morning briefing at 768. |
| `v1-768-f3.png` | Task card at 768. |
| `v1-768-f5.png` | F5 viewport at 768. |
