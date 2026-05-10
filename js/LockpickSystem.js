/* =========================================
   LockpickSystem.js — Lockpick Mechanic
   lockpick-trainer (NoPixel 4.0) style
   
   MECHANIC:
   - N nodes placed on a circle
   - Each node has an arrow direction (↑↓←→)
   - A white cursor rotates on the circle
   - Press correct arrow key when cursor reaches a node
   - Correct → node turns green, move to next
   - Wrong key or too late → FAIL
   - All nodes completed → SUCCESS
   
   FLOW:
   1. start() → waiting state (cursor stopped)
   2. First keypress → started (cursor begins rotating)
   3. Result → shown on screen → callback invoked
   ========================================= */

class LockpickSystem {
    constructor() {
        // Game state
        this.active = false;
        this.started = false;       // Was first key pressed
        this.result = null;         // 'success' | 'fail' | null
        this.finished = false;      // Was callback invoked
        this.onComplete = null;

        // Nodes
        this.nodes = [];
        this.currentNodeIndex = 0;

        // Cursor
        this.cursorAngle = 0;
        this.cursorSpeed = 90;

        // Difficulty
        this.difficulty = 1;
        this.hitTolerance = 25;

        // Result display
        this.resultTimer = 0;
        this.resultDuration = 1.5;

        // Arrow directions
        this.DIRECTIONS = ['up', 'down', 'left', 'right'];
        this.DIR_KEYS = {
            up: ['ArrowUp', 'KeyW'],
            down: ['ArrowDown', 'KeyS'],
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD']
        };
        this.DIR_SYMBOLS = {
            up: '↑',
            down: '↓',
            left: '←',
            right: '→'
        };
    }

    /**
     * Start lockpick session
     */
    start(difficulty, onComplete) {
        this.difficulty = Utils.clamp(difficulty, 1, 6);
        this.onComplete = onComplete;
        this.result = null;
        this.finished = false;
        this.started = false;       // Wait, start on first keypress
        this.resultTimer = 0;
        this.currentNodeIndex = 0;

        this._configure();
        this._generateNodes();

        // Position cursor slightly before first node
        const firstNodeAngle = this.nodes[0].angle;
        this.cursorAngle = (firstNodeAngle - 50 + 360) % 360;

        this.active = true;
    }

    _configure() {
        const nodeCounts = [4, 5, 5, 6, 6, 7];
        this.nodeCount = nodeCounts[this.difficulty - 1];

        const speeds = [70, 90, 110, 130, 160, 200];
        this.cursorSpeed = speeds[this.difficulty - 1];

        const tolerances = [28, 24, 20, 16, 13, 10];
        this.hitTolerance = tolerances[this.difficulty - 1];
    }

    _generateNodes() {
        this.nodes = [];
        const angleStep = 360 / this.nodeCount;

        for (let i = 0; i < this.nodeCount; i++) {
            const angle = (i * angleStep - 90 + 360) % 360;
            const dir = this.DIRECTIONS[Utils.randInt(0, 3)];

            this.nodes.push({
                angle: angle,
                direction: dir,
                solved: false,
                failed: false
            });
        }
    }

    /**
     * Update every frame
     */
    update(dt) {
        if (!this.active) return;

        // Showing result — count timer, then invoke callback
        if (this.result !== null) {
            this.resultTimer += dt;
            if (this.resultTimer >= this.resultDuration && !this.finished) {
                this.finished = true;
                if (this.onComplete) {
                    this.onComplete(this.result === 'success');
                }
            }
            return;
        }

        // Don't rotate cursor until started
        if (!this.started) return;

        // Rotate cursor
        this.cursorAngle = (this.cursorAngle + this.cursorSpeed * dt) % 360;

        // Did cursor pass active node?
        this._checkMiss();
    }

    /**
     * Key input
     */
    handleKey(code) {
        if (!this.active || this.result !== null) return false;

        // Check if valid direction key
        const isDirectionKey = Object.values(this.DIR_KEYS).some(keys => keys.includes(code));
        if (!isDirectionKey) return false;

        // First keypress only starts cursor, no node check
        if (!this.started) {
            this.started = true;
            return true; // Cursor starts rotating, this key doesn't count
        }

        const currentNode = this.nodes[this.currentNodeIndex];
        if (!currentNode || currentNode.solved) return false;

        // Is cursor near active node?
        const dist = this._angleDist(this.cursorAngle, currentNode.angle);
        if (dist > this.hitTolerance) {
            // Pressed key while not near node → FAIL
            this._fail();
            return true;
        }

        // Correct key?
        const validKeys = this.DIR_KEYS[currentNode.direction];
        if (validKeys.includes(code)) {
            // CORRECT!
            currentNode.solved = true;
            this.currentNodeIndex++;

            // All solved?
            if (this.currentNodeIndex >= this.nodes.length) {
                this.result = 'success';
                this.resultTimer = 0;
            }
        } else {
            // Wrong key → FAIL
            this._fail();
        }

        return true;
    }

    _checkMiss() {
        if (this.currentNodeIndex >= this.nodes.length) return;
        const currentNode = this.nodes[this.currentNodeIndex];
        if (!currentNode || currentNode.solved) return;

        const dist = this._angleDist(this.cursorAngle, currentNode.angle);
        const past = this._isAnglePast(this.cursorAngle, currentNode.angle, this.hitTolerance + 5);

        if (past && dist > this.hitTolerance + 5) {
            this._fail();
        }
    }

    _isAnglePast(cursorAngle, nodeAngle, margin) {
        const diff = ((cursorAngle - nodeAngle) % 360 + 360) % 360;
        return diff > margin && diff < 180;
    }

    _angleDist(a, b) {
        let diff = Math.abs(((a - b) % 360 + 360) % 360);
        return diff > 180 ? 360 - diff : diff;
    }

    _fail() {
        const currentNode = this.nodes[this.currentNodeIndex];
        if (currentNode) {
            currentNode.failed = true;
        }
        this.result = 'fail';
        this.resultTimer = 0;
    }

    // ════════════════════════════════════════
    //  RENDER (Ekrana Çizim İşlemleri - CG)
    // ════════════════════════════════════════

    render(ctx, cx, cy) {
        if (!this.active) return;

        const radius = 140;
        const nodeSize = 32;

        ctx.save();
        //  burada işlem kolaylığı için ekranın merkez noktasını (origin) asıl çizim yapacağımız cx, cy noktasına taşıyoruz (Translation)
        ctx.translate(cx, cy);

        // 0. Dış dekoratif halka — CG: Rotation transformation
        ctx.save();
        // Halkanın dönme efekti için radyan cinsinden rotasyon uyguluyoruz
        ctx.rotate(this.cursorAngle * Math.PI / 180 * 0.3); // Yavaş dönüş
        ctx.beginPath();
        ctx.arc(0, 0, radius + 18, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(59,130,246,0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 12]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore(); // Her rotasyondan sonra State'i geri alıyoruz ki diğer objeler yamuk çizilmesin

        // 0b. İç dekoratif halka — CG: Counter-rotation
        ctx.save();
        // Ters yöne dönmesi için rotasyon açısını eksi (-) yapıyoruz
        ctx.rotate(-this.cursorAngle * Math.PI / 180 * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, radius - 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(59,130,246,0.05)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 1. Ana daire
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 2. Connection lines
        this._drawConnections(ctx, radius);

        // 3. Merkez kilit
        this._drawLockIcon(ctx);

        // 4. Nodes
        for (let i = 0; i < this.nodes.length; i++) {
            this._drawNode(ctx, this.nodes[i], i, radius, nodeSize);
        }

        // 5. Cursor
        if (this.result === null) {
            this._drawCursor(ctx, radius);
        }

        // 6. Progress bar
        this._drawProgressBar(ctx, radius);

        // 7. "Press a key to start" text
        if (!this.started && this.result === null) {
            ctx.fillStyle = '#64748b';
            ctx.font = '500 15px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText('Press an arrow key to start', 0, radius + 65);
        }

        // 8. Result text
        if (this.result !== null) {
            this._drawResult(ctx, radius);
        }

        ctx.restore();
    }

    _drawConnections(ctx, radius) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.nodes.length; i++) {
            const a = this.nodes[i];
            const b = this.nodes[(i + 1) % this.nodes.length];
            const ax = Math.cos(Utils.degToRad(a.angle)) * radius;
            const ay = Math.sin(Utils.degToRad(a.angle)) * radius;
            const bx = Math.cos(Utils.degToRad(b.angle)) * radius;
            const by = Math.sin(Utils.degToRad(b.angle)) * radius;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }
    }

    _drawLockIcon(ctx) {
        const s = 18;
        ctx.save();
        const isOpen = this.result === 'success';
        ctx.fillStyle = isOpen ? '#22c55e' : '#1e293b';
        ctx.strokeStyle = isOpen ? '#22c55e' : '#334155';
        ctx.lineWidth = 2;
        Utils.roundRect(ctx, -s / 2, -2, s, s * 0.8, 3);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -2, s * 0.35, Math.PI, 0, false);
        ctx.strokeStyle = isOpen ? '#22c55e' : '#475569';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    _drawNode(ctx, node, index, radius, size) {
        const rad = Utils.degToRad(node.angle);
        const nx = Math.cos(rad) * radius;
        const ny = Math.sin(rad) * radius;
        const half = size / 2;

        ctx.save();
        ctx.translate(nx, ny);

        let bgColor, borderColor, textColor;

        if (node.solved) {
            bgColor = 'rgba(34,197,94,0.15)';
            borderColor = '#22c55e';
            textColor = '#22c55e';
        } else if (node.failed) {
            bgColor = 'rgba(239,68,68,0.15)';
            borderColor = '#ef4444';
            textColor = '#ef4444';
        } else if (index === this.currentNodeIndex && this.result === null) {
            bgColor = 'rgba(59,130,246,0.15)';
            borderColor = '#3b82f6';
            textColor = '#e2e8f0';
        } else {
            bgColor = 'rgba(15,23,42,0.8)';
            borderColor = '#334155';
            textColor = '#64748b';
        }

        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = node.solved || node.failed ? 2 : 1.5;
        Utils.roundRect(ctx, -half, -half, size, size, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = textColor;
        ctx.font = '600 18px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.DIR_SYMBOLS[node.direction], 0, 1);

        ctx.restore();
    }

    _drawCursor(ctx, radius) {
        const rad = Utils.degToRad(this.cursorAngle);
        const cx = Math.cos(rad) * radius;
        const cy = Math.sin(rad) * radius;
        const dotSize = 6;

        // Line from center
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = 'rgba(226,232,240,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cursor nokta
        ctx.beginPath();
        ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, dotSize + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(226,232,240,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _drawProgressBar(ctx, radius) {
        const total = this.nodes.length;
        const solved = this.nodes.filter(n => n.solved).length;
        const barW = 120;
        const barH = 4;
        const y = radius + 40;

        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, -barW / 2, y, barW, barH, 2);
        ctx.fill();

        if (solved > 0) {
            ctx.fillStyle = '#3b82f6';
            Utils.roundRect(ctx, -barW / 2, y, barW * (solved / total), barH, 2);
            ctx.fill();
        }

        ctx.fillStyle = '#64748b';
        ctx.font = '400 12px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(`${solved} / ${total}`, 0, y + 18);
    }

    _drawResult(ctx, radius) {
        const isSuccess = this.result === 'success';
        const color = isSuccess ? '#22c55e' : '#ef4444';
        const text = isSuccess ? 'ACCESS GRANTED' : 'FAILED';

        ctx.fillStyle = color;
        ctx.font = '700 22px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, -radius - 30);
    }
}
