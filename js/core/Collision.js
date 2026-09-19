/* =========================================
   Collision.js — Collision & Hit-Detection Primitives

   Single source of truth for zone/collision semantics.

   RULES (frozen — do not change without updating tests):
   - Zone bounds are INCLUSIVE: [start, end].
   - Normalized distance is measured against the zone half-width,
     so 0 = dead center and 1 = exactly on a boundary.
   - Angle math is orientation-safe in [0, 360).
   ========================================= */

const Collision = {
    /**
     * Inclusive range test: start <= pos <= end.
     */
    pointInRange(pos, start, end) {
        return pos >= start && pos <= end;
    },

    /**
     * Inclusive point-in-zone test.
     * @param {number} pos
     * @param {{start:number,end:number}} zone
     */
    pointInZone(pos, zone) {
        return Collision.pointInRange(pos, zone.start, zone.end);
    },

    /**
     * Distance from zone center normalized by half-width.
     * 0 = center, 1 = boundary, >1 = outside.
     * Returns Infinity for a degenerate (zero/negative width) zone.
     */
    normalizedDistanceFromCenter(pos, zone) {
        const center = (zone.start + zone.end) / 2;
        const half = (zone.end - zone.start) / 2;
        if (half <= 0) return Infinity;
        return Math.abs(pos - center) / half;
    },

    /**
     * Smallest angular distance between two angles in degrees.
     */
    angleDistanceDeg(a, b) {
        let diff = Math.abs(((a - b) % 360 + 360) % 360);
        return diff > 180 ? 360 - diff : diff;
    },

    /**
     * Has the cursor advanced past the node by more than `margin`
     * degrees without wrapping into the "behind" half-circle?
     */
    isAnglePast(cursorAngle, nodeAngle, margin) {
        const diff = ((cursorAngle - nodeAngle) % 360 + 360) % 360;
        return diff > margin && diff < 180;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Collision;
