# SyncBreaker 🌌

**SyncBreaker** is a browser-based, cyberpunk-themed defense game built as a **Computer Graphics Final Project**. The game focuses on fundamental graphics programming concepts—such as transformations, physics, particle systems, and rendering loops—built entirely from scratch using **Vanilla JavaScript** and the **HTML5 Canvas API** without any external game engines.

🔗 **[Play the Game Live](http://syncbreaker.dormhi.com/)**

## 🎮 Gameplay
You are tasked with defending a system against an active cyber attack. You must clean infected nodes and rebuild the firewall using two core mechanics:
1. **Timing Bar (Main Defense):** Press `Space` (or tap the screen) right when the indicator hits the green target zone to successfully clean the node. As you progress, the speed increases and the target zone shrinks.
2. **Code Breaker (Lockpick):** Bypass locked nodes by solving a dynamic radial mini-game. Press the corresponding `Arrow Keys` (or swipe `Up/Down/Left/Right` on mobile) when the rotating scanner aligns with the nodes.

## ✨ Features
- **Object-Oriented Architecture:** Fully decoupled systems for UI, Game State, Energy Management, and Level configurations.
- **Endless Mode:** Survive an infinite wave of attacks where difficulty progressively scales up.
- **Online Endless Leaderboard:** Unlock Endless Mode, pick a unique operator name and password, and keep your rank on any browser.
- **English and Turkish:** pick the language with the globe badge on the main menu; every screen, lesson and game is translated (`js/i18n/tr.js`). New features support both languages from the start.
- **Field guide & tips:** a `?` button (or H) opens a short in-game guide; a quiet tip line adapts to touch or keyboard.
- **Energy & Progression System:** Energy depletes when taking shortcuts or reviving, and slowly regenerates over time (persists via `localStorage`).
- **Mobile-Ready:** Fully supports touch interactions (Tap to shoot, Swipe to lockpick) for a seamless mobile experience.

## 📐 Computer Graphics Concepts Implemented
This project was designed to demonstrate core Computer Graphics principles:
- **Transformations (Translation & Rotation):** Utilized `ctx.translate` and `ctx.rotate` to handle complex radial drawing and cursor animations.
- **Trigonometric Velocity Vectors:** Calculated X and Y trajectory shifts for background particles using `Math.sin()` and `Math.cos()`.
- **Coordinate Wrapping:** Seamlessly looping particles across the canvas boundaries to create an infinite background effect.
- **Custom Render Pipeline:** Implemented a continuous `requestAnimationFrame` loop with Delta Time (`dt`) to decouple logic updates from the frame rate.
- **Particle Systems:** Created a digital rain matrix effect and dynamic hit-sparks upon successful defense actions.

## 🛠 Installation & Running Locally
No build tools or installations are required. 
1. Clone the repository:
   ```bash
   git clone https://github.com/dormhi/syncbreaker.git
   ```
2. Open `index.html` in any modern browser or use a local extension like VS Code Live Server.

To enable the shared leaderboard, complete the one-time [Supabase setup](SUPABASE_SETUP.md) before deploying.

## 🧪 Tests
The deterministic core is covered by a zero-dependency test runner:

```bash
node tests/run.js
```

It verifies collision semantics, the timing-bar motion model, hit detection,
frame-rate independence, sub-frame input resolution, the fixed-timestep game
loop, the Matter.js layer, Stack Overflow gameplay, and the campaign: data,
lock rules, old-save migration, the act map / act screen flows, keyboard
navigation and the lockpick tuning.

## ⚙️ v2 Architecture (physics hardening)
This branch reworks the timing/physics layer for frame-rate independence and
flawless hit detection without changing difficulty:

- `js/core/GameLoop.js` — fixed 60 Hz simulation + accumulator catch-up +
  render interpolation (removes the old `MAX_DT` slow-motion).
- `js/core/Collision.js` — single, tested home for zone/collision semantics
  (bounds are inclusive).
- `js/mechanics/TimingBarMechanic.js` — analytic triangle-wave motion; in-zone
  speed equals the configured `barSpeed` exactly, so per-hit difficulty is
  unchanged, while edge timing is deterministic.
- `js/core/InputManager.js` — unified pointer + keyboard input, ignores
  OS key auto-repeat, sub-frame press timestamps, no synthetic-click double-fire.
- Background animations are advanced in `update()` only; render is pure — this
  fixes backgrounds speeding up on 120/144 Hz displays.
- `vendor/matter.min.js` + `js/core/PhysicsWorld.js` — Matter.js powers the
  **physics bonus minigames only**; the core mechanics deliberately stay on
  their own deterministic solver so hit timing never depends on a rigid-body
  engine. `PhysicsWorld` runs Matter on a fixed 60 Hz step (internal
  accumulator, identical results at 30/60/144 Hz), keeps the previous pose of
  every body for render interpolation, exposes px/s and px/s² units, and
  reports collisions by parent body.

Difficulty numbers now live in `js/data/Campaign.js` and are changed only on
purpose (see `docs/ACT_PLAN.md`).

## 🧩 Phase 1 — Minigames & progression
> History: this describes the earlier 6-node build. The HUB, the ACT I / II
> split and the lockpick skip were replaced by the 6-act campaign below.

- **Level selector (HUB) redesign:** modern ACT I / ACT II panels with vector
  mission logos (`js/LevelIcons.js`), per-node status, best score, and a gate
  node between the acts.
- **Packet Purge** (`js/mechanics/PacketPurgeMechanic.js`) — the randomized,
  two-wave reaction gate that unlocks ACT II (levels 4-6). Infected (red)
  packets travel faster than clean (blue) ones, and wave 2 escalates. It has
  no name in the menu; it appears only as the lock between the two acts.
- **Dual Ring Decrypt** (`js/mechanics/DualRingMechanic.js`) — a hidden energy
  easter egg. When energy is not full, a random energy-bar cell silently opens
  a multi-round ring-alignment challenge (3 alignments in a row); success
  grants up to +3 energy (capped at 6). Ring speed scales with missing energy
  (lower energy = harder), always clamped to a playable range. Time-based
  regeneration is untouched.
- **Attempt windows** (`js/core/ChallengeGate.js`): Dual Ring 2 / 5 min,
  Packet Purge 2 / 3 min.
- **Energy cap is now 6** (`js/EnergySystem.js`) with a clamp-safe `addEnergy`.
- **Lockpick (Code Breaker):** now used only for in-level revives (2 charges)
  and to skip locked ACT I nodes (levels 2-3); it can no longer unlock ACT II.
  Decorations use a continuous animation clock (no jump on the 360°→0° wrap),
  with solve pulses and a start pop.

## 🗺 Campaign: 6 acts
The game is a campaign of 6 acts. Each act is one game, and its 3-5 stages
are that game's rising difficulty tiers. Clearing every stage completes the
act. A gate (Packet Purge, harder each time) opens the next act. The full plan
and all decisions are in [`docs/ACT_PLAN.md`](docs/ACT_PLAN.md); the short
version for contributors and agents is in [`AGENTS.md`](AGENTS.md).

| Act | Name | Game | Stages |
|---|---|---|---|
| 1 | REMOVE_MALWARE | Timing Bar | 4 (8 / 10 / 14 / 18 hits) |
| 2 | REBUILD_FIREWALL | Stack Overflow (Matter.js) | 3 (5 / 7 / 9 blocks high) |
| 3-6 | CLOSE_PORTS, RESET_CREDS, TRACE_LOGS, CUT_ACCESS | in development | — |

- Data lives in `js/data/Campaign.js`; progress, lock rules and the one-time
  migration of old saves live in `js/CampaignProgress.js` (`sb_campaign_v1`).
- HUB: an act map (snake layout with the gates between acts) and a per-act
  stage screen. Both can be driven by touch, mouse or keyboard
  (arrows + Enter, Escape to go back).
- The lockpick is only used for revives (Timing Bar and Endless), with a
  slightly easier tuning. Endless unlocks after Act 6; players who already had
  it keep it.

### Stack Overflow (Act 2)
- A crane sweeps above the core; tap anywhere (or SPACE) to drop a block. It
  falls under real rigid-body physics and keeps 30% of the crane's sideways
  momentum.
- Build a tower that stands still above the limit line for 1 s. Blocks that
  fall off cost a life (3 lives). Difficulty comes from the tower height and a
  micro-step faster crane.
- Settled blocks buried 3+ deep are frozen, so the solver cannot make a tall
  stack creep and collapse on its own.

## 🎓 About
Developed as a Computer Graphics University Final Project.
