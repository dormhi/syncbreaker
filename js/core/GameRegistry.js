/* =========================================
   GameRegistry.js — How each campaign game is run

   kind 'bar'      : Timing Bar, runs in the LEVEL state (LevelManager)
   kind 'mechanic' : any Mechanic, runs in the generic MINIGAME state
   revive          : whether a failed stage can be continued with the
                     lockpick (only continuous games)
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

    get(key) { return (key && this[key] && typeof this[key] === 'object') ? this[key] : null; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = GameRegistry;
