/* =========================================
   GameRegistry.js — How each campaign game is run

   kind 'bar'      : Timing Bar, runs in the LEVEL state (LevelManager)
   kind 'mechanic' : any Mechanic, runs in the generic MINIGAME state
   revive          : whether a failed stage can be continued with the
                     lockpick (only continuous games). A 'mechanic' game
                     with revive must implement revive() (one life, go on).
   ========================================= */

const GameRegistry = {
    timingbar: {
        kind: 'bar',
        revive: true,
        title: 'TIMING BAR'
    },
    stack: {
        kind: 'mechanic',
        revive: false,
        title: 'STACK OVERFLOW',
        failMessage: 'The firewall collapsed — rebuild it from scratch',
        create: (params) => new StackOverflowMechanic(Object.assign({}, params))
    },

    orbital: {
        kind: 'mechanic',
        revive: true,
        title: 'ORBITAL SHIELD',
        failMessage: 'A port was breached — the attackers got in',
        create: (params) => new OrbitalShieldMechanic(Object.assign({}, params))
    },

    signal: {
        kind: 'mechanic',
        revive: true,
        reviveLabel: '+20s',
        title: 'SIGNAL LOCK',
        create: (params) => new SignalLockMechanic(Object.assign({}, params))
    },

    route: {
        kind: 'mechanic',
        revive: true,
        reviveLabel: '+20s',
        title: 'ROUTE TRACE',
        create: (params) => new RouteTraceMechanic(Object.assign({}, params))
    },

    cut: {
        kind: 'mechanic',
        revive: true,
        reviveLabel: '+1 LIFE',
        title: 'NETWORK CUT',
        create: (params) => new NetworkCutMechanic(Object.assign({}, params))
    },

    bomb: {
        kind: 'mechanic',
        revive: true,
        reviveLabel: '+20s',
        title: 'LOGIC BOMB',
        create: (params) => new LogicBombMechanic(Object.assign({}, params))
    },

    get(key) { return (key && this[key] && typeof this[key] === 'object') ? this[key] : null; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = GameRegistry;
