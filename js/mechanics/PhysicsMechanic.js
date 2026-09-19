/* =========================================
   PhysicsMechanic.js — Physics Minigame Skeleton

   Example/reference implementation of a physics-based bonus minigame
   built on PhysicsWorld (Matter.js). Not wired into the story yet.

   This exists so that adding a real physics minigame later is just:
     1) subclass / configure this
     2) register it as a Mechanic in GameManager
   ========================================= */

const _MechanicBaseP = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class PhysicsMechanic extends _MechanicBaseP {
    constructor(options = {}) {
        super();
        this.options = options;
        this.world = null;
        this.bodies = [];
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.world = new PhysicsWorld({
            gravity: this.options.gravity !== undefined ? this.options.gravity : 1,
            fixedDt: this.options.fixedDt || 1 / 60
        });
        this._setupBodies(context);
    }

    _setupBodies(/* context */) {
        // Subclasses create and add bodies here.
    }

    update(fixedDt) {
        if (!this.active || !this.world) return;
        // Deterministic: always advance exactly one fixed step.
        this.world.step(fixedDt);
        this._evaluate();
    }

    _evaluate(/* */) {
        // Subclasses decide success/failure and set this.result.
    }

    render(/* ctx, alpha */) {
        // Subclasses draw bodies from Matter body positions.
    }

    reset() {
        super.reset();
        if (this.world) this.world.clear();
        this.bodies = [];
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PhysicsMechanic;
