/* =========================================
   Mechanic.js — Shared Minigame Contract

   Every gameplay mechanic (timing bar, lockpick, future physics
   minigames) implements this lifecycle:

     init(context)          called when the mechanic becomes active
     update(fixedDt)        deterministic logic; the ONLY place state mutates
     render(ctx, alpha)     PURE; must not mutate simulation state
     handleInput(input)     input is an action: { code, timestamp }
     reset()                re-arm for a fresh session
     result                 null | { type, ... }

   `alpha` is the fixed-timestep interpolation factor in [0, 1).
   ========================================= */

class Mechanic {
    constructor() {
        this.active = false;
        this.result = null;
    }

    init(/* context */) { this.active = true; }

    update(/* fixedDt */) {}

    render(/* ctx, alpha */) {}

    /** @returns {boolean} true if the input was consumed */
    handleInput(/* input */) { return false; }

    reset() {
        this.active = false;
        this.result = null;
    }

    get isActive() { return this.active; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Mechanic;
