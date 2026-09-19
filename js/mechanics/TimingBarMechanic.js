/* =========================================
   TimingBarMechanic.js — Deterministic Timing Bar

   MOTION MODEL (frozen):
     position(t) is a pure analytic function of simulation time:
       rise:  pos = v * u                      (0 -> 1)
       dwell: pos = 1                          (edge hold, duration = edgeDwell)
       fall:  pos = 1 - v * u                  (1 -> 0)
       dwell: pos = 0                          (edge hold, duration = edgeDwell)

     - `v` is the in-zone linear speed. It is EXACTLY the configured
       barSpeed, so per-hit difficulty is unchanged.
     - `edgeDwell = refDt / 2` reproduces the small time the old
       frame-quantized clamp lost at the edges, so the full cycle
       duration is unchanged. It is fully configurable.
     - Because position is analytic, there is NO frame-rate drift and
       NO clamp truncation: the same time always yields the same position.

   DIFFICULTY CONTRACT: do not change `v` scaling or edgeDwell without
   re-running tests/timing.test.js against the baseline.
   ========================================= */

const _MechanicBase = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class TimingBarMechanic extends _MechanicBase {
    constructor(refDt = 1 / 60) {
        super();
        this.refDt = refDt;
        this.edgeDwell = refDt / 2;

        this.time = 0;          // accumulated simulation time (s)
        this.stepDt = refDt;    // last fixed step (for render interpolation)
        this.speed = 1;         // normalized bar units per second
        this.targetSize = 0.2;
        this.zone = { start: 0, end: 0 };
    }

    reset(speed, targetSize) {
        this.time = 0;
        this.stepDt = this.refDt;
        this.speed = speed;
        this.targetSize = targetSize;
        this.regenerateZone();
        this.active = true;
        this.result = null;
    }

    setSpeed(speed) { this.speed = speed; }

    setTargetSize(targetSize) { this.targetSize = targetSize; }

    regenerateZone() {
        const size = this.targetSize;
        const start = Utils.randFloat(0.05, 0.95 - size);
        this.zone.start = start;
        this.zone.end = start + size;
    }

    update(fixedDt) {
        this.stepDt = fixedDt;
        this.time += fixedDt;
    }

    /**
     * Exact position at simulation time `t`.
     */
    positionAt(t) {
        const v = this.speed;
        if (v <= 0) return 0;

        const rise = 1 / v;
        const dwell = this.edgeDwell;
        const cycle = (rise + dwell) * 2;

        let u = t % cycle;
        if (u < 0) u += cycle;

        if (u < rise) return v * u;
        u -= rise;

        if (u < dwell) return 1;
        u -= dwell;

        if (u < rise) return 1 - v * u;
        return 0;
    }

    /**
     * Sample the bar position, optionally offset into the future by
     * `offset` seconds. Used for sub-frame input resolution and render
     * interpolation without mutating state.
     */
    sample(offset = 0) {
        return this.positionAt(this.time + offset);
    }

    get position() { return this.sample(0); }
    get zoneStart() { return this.zone.start; }
    get zoneEnd() { return this.zone.end; }

    hitTest(pos) {
        return {
            inZone: Collision.pointInZone(pos, this.zone),
            dist: Collision.normalizedDistanceFromCenter(pos, this.zone)
        };
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = TimingBarMechanic;
