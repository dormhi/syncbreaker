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
- **Online Endless Leaderboard:** Unlock Endless Mode, choose a unique operator name, and compete on the shared top 10 leaderboard.
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
frame-rate independence, calibration against the legacy clamp (difficulty is
unchanged), sub-frame input resolution, the fixed-timestep game loop, and a
`LevelManager` integration smoke test.

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
- `vendor/matter.min.js` + `js/core/PhysicsWorld.js` — Matter.js is vendored for
  **future physics-based bonus minigames only**; the core mechanics deliberately
  stay on their own deterministic solver so hit timing never depends on a
  rigid-body engine.

The frozen difficulty contract (bar speeds, target sizes, hit requirements,
scoring, lives, lockpick tuning, energy costs) is unchanged.


## 🎓 About
Developed as a Computer Graphics University Final Project.
