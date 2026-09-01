# SyncBreaker 🌌

**SyncBreaker** is a browser-based, cyberpunk-themed defense game built as a **Computer Graphics Final Project**. The game focuses on fundamental graphics programming concepts—such as transformations, physics, particle systems, and rendering loops—built entirely from scratch using **Vanilla JavaScript** and the **HTML5 Canvas API** without any external game engines.

🔗 **[Play the Game Live](www.dormhi.info)**

## 🎮 Gameplay
You are tasked with defending a system against an active cyber attack. You must clean infected nodes and rebuild the firewall using two core mechanics:
1. **Timing Bar (Main Defense):** Press `Space` (or tap the screen) right when the indicator hits the green target zone to successfully clean the node. As you progress, the speed increases and the target zone shrinks.
2. **Code Breaker (Lockpick):** Bypass locked nodes by solving a dynamic radial mini-game. Press the corresponding `Arrow Keys` (or swipe `Up/Down/Left/Right` on mobile) when the rotating scanner aligns with the nodes.

## ✨ Features
- **Object-Oriented Architecture:** Fully decoupled systems for UI, Game State, Energy Management, and Level configurations.
- **Endless Mode:** Survive an infinite wave of attacks where difficulty progressively scales up.
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

## 🎓 About
Developed as a Computer Graphics University Final Project.
