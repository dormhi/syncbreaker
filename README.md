# SyncBreaker 🌌

**SyncBreaker** is a cyberpunk-themed browser game built as a **Computer Graphics final project**. It runs on plain JavaScript and the HTML5 Canvas API: no game engine, no framework, no build step.

🔗 **[Play it live: syncbreaker.dormhi.com](https://syncbreaker.dormhi.com/)**

## 🎮 The game

The Director's system is under attack. You are the **operator**: you push the attacker out layer by layer, from the network's perimeter down to its core, prove the system is clean, and finally hand control back to the Director, teaching them how to keep it safe.

The campaign has **10 acts**. Every act is its own game, and its stages are that game's rising difficulty tiers. Clear every stage of an act, then breach the gate (a Packet Purge reaction game) to open the next one.

| Act | Name | Game | What you do | Stages |
|---|---|---|---|---|
| 1 | REMOVE_MALWARE | **Timing Bar** | Hit the moving bar inside the target zone | 4 |
| 2 | REBUILD_FIREWALL | **Stack Overflow** | Drop swinging blocks into a stable tower (Matter.js physics) | 3 |
| 3 | CLOSE_PORTS | **Orbital Shield** | Jump a shield between ports to block incoming packets | 4 |
| 4 | RESET_CREDS | **Signal Lock** | Hold and release to match a drifting signal wave | 5 |
| 5 | TRACE_LOGS | **Route Trace** | Rotate tiles to connect your node to the attacker | 3 |
| 6 | CUT_ACCESS | **Network Cut** | Cut every attacker path to the core with limited scissors | 4 |
| 7 | DEFUSE_PAYLOAD | **Logic Bomb** | Defuse a payload's modules by following its manual | 4 |
| 8 | RESTORE_CORE | **Defrag** | Drag backup blocks until the core disk is full | 4 |
| 9 | FINAL_AUDIT | **Checksum Grid** | Rebuild the memory map from row and column checksums (a nonogram) | 5 |
| 10 | RETURN_CONTROL | **Handover missions** | Six short lessons on real security habits: virus scans, passwords, 2FA, phishing, updates, backups | 6 |

The network layers set the mood: **PERIMETER** (acts 1–3), **INTERNAL** (4–6), **CORE** (7–9) and **HANDOVER** (10) each have their own colours and atmosphere.

### Features
- **Games that teach themselves:** every game opens with a short, hands-on lesson the first time. Checksum Grid has a four-chapter lesson for players who have never seen a nonogram, a replay button and a two-step hint.
- **Stars:** each stage ends with 1–3 stars, based on how well it went (no misses, time left, no wasted cuts…). A revive caps a run at one star.
- **Revives:** in games you can lose, the **Code Breaker** lockpick (a radial timing mini-game) can bring a failed run back for one energy cell. Energy refills over time.
- **Endless Mode:** unlocked after Act 10. Pick any of the first nine games and play round after round with rising difficulty; each game has its own online leaderboard. Network Cut also has 5 and 10 minute challenges.
- **Operator accounts:** a unique operator name and password is needed to play. Progress, stars and Endless bests follow the operator to any browser and still work offline once signed in.
- **English and Turkish:** pick the language with the globe badge on the main menu. Every screen, lesson and game is translated.
- **Sound:** separate music and sound-effect levels (speaker on the act map, or the pause panel).
- **Phones and desktops:** every game plays by touch (tap, hold or drag) and by keyboard or mouse. Landscape only for now; a phone held upright is asked to rotate.
- **Field guide:** the `?` button (or `H`) opens a short in-game guide; a quiet tip line adapts to touch or keyboard.
- **Calm by default:** soft screen transitions, and effects respect the system's *reduce motion* setting.

## 📐 Computer graphics concepts
- **Fixed-timestep simulation with interpolated rendering:** the game logic always steps at 60 Hz with an accumulator; rendering interpolates between the last two states, so motion is smooth and identical at 30, 60 or 144 Hz.
- **Transformations:** `translate`, `rotate` and `scale` for the radial games (Orbital Shield, Code Breaker), the high-DPI backing store and the parallax act map.
- **Analytic motion:** the timing bar's position is a closed-form triangle wave, so hits are exact and frame-rate independent.
- **Rigid-body physics:** Stack Overflow runs on Matter.js inside a fixed-step wrapper with pose interpolation.
- **Particle systems:** digital rain, hit sparks and background particles with trigonometric velocities and coordinate wrapping.
- **Procedural content:** puzzle generators for Route Trace, Network Cut, Logic Bomb, Defrag and Checksum Grid, each checked by a solver so every puzzle can be solved without guessing.
- **Hit testing and input:** one input layer for keyboard, mouse and touch, with sub-frame timestamps for timing games and drag / hold support.

## 🛠 Running locally
No build tools or installs are needed. Serve the repository root with any static server:

```bash
git clone https://github.com/dormhi/syncbreaker.git
cd syncbreaker
python3 -m http.server 8791
```

Then open `http://localhost:8791`.

## 🧪 Tests
A zero-dependency test runner covers the deterministic core and every game:

```bash
node tests/run.js
```

It checks collision and timing rules, frame-rate independence, the fixed-step loop and the physics layer, every game's rules and puzzle generators (solvable, unique where needed), the campaign (lock rules, stars, act map and act screen flows, keyboard navigation), Endless, progress sync, the pause and back-button handling, and both languages: every stage is also played through in Turkish to catch missing translations.

## 🧱 Project structure
| Path | What lives there |
|---|---|
| `index.html` | Loads every script in dependency order (with a `?v=` cache-busting tag) |
| `js/main.js` | Entry point: canvas setup, high-DPI scaling, the game loop |
| `js/GameManager.js` | All screens and the flows between them |
| `js/core/` | Game loop, input, physics wrapper, lessons (`Coach`), languages (`I18n`), Endless runs, back-button guard |
| `js/mechanics/` | One file per game, all following the `Mechanic` contract |
| `js/data/` | Campaign and Endless data: acts, stages, gates, difficulty numbers, star rules |
| `js/i18n/tr.js` | Turkish texts, keyed by the English source text |
| `supabase/schema.sql` | The whole online database in one re-runnable file |
| `tests/` | The test runner and its browser-free harness |
| `vendor/` | Matter.js |

The logical canvas is always 960 × 640; the backing store is scaled by the screen's pixel density (up to 2×). Game state only changes in fixed `update` steps, and rendering never changes state.

## ☁️ Online features
Accounts, saved progress and the Endless leaderboards use [Supabase](https://supabase.com). To run your own copy:

1. Create a Supabase project and enable **Anonymous Sign-Ins** (Authentication → Providers).
2. Run `supabase/schema.sql` in the SQL Editor. It is safe to re-run and deletes nothing.
3. Put the project URL and the **publishable** key in `js/supabase-config.js`, in its `.env`-style `NEXT_PUBLIC_SUPABASE_URL=` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` lines (never a secret or service-role key).
4. Add your local and production URLs under Authentication → URL Configuration.

Without this the game still runs locally, but you cannot create an operator or post scores. The client is the authority for gameplay, so the server does basic validation, not full anti-cheat.

## 🎓 About
Developed as a Computer Graphics university final project by [dormhi](https://dormhi.com).
