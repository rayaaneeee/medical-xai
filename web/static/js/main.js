/* ═══════════════════════════════════════════════════════
   DermAI — main.js
   Handles: custom cursor, hero canvas, scroll reveals,
            stat counters, reliability diagram canvas
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Custom Cursor ──────────────────────────────────── */
  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursor-dot');
  let mx = -100, my = -100, cx = -100, cy = -100;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function animateCursor() {
    cx += (mx - cx) * 0.14;
    cy += (my - cy) * 0.14;
    if (cursor)    cursor.style.transform    = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
    if (cursorDot) cursorDot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  /* ── Navbar scroll ──────────────────────────────────── */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  /* ── Scroll Reveal (IntersectionObserver) ───────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el  = entry.target;
        const delay = el.dataset.delay || 0;
        setTimeout(() => el.classList.add('visible'), +delay);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ── Animated Stat Counters ─────────────────────────── */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el) {
    const target = parseFloat(el.dataset.target);
    const decimals = el.dataset.decimals ? +el.dataset.decimals : 0;
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = target * easeOut(progress);
      el.textContent = value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const statsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-target]').forEach(el => countUp(el));
        statsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.hero-stats').forEach(el => statsObserver.observe(el));

  /* ── Hero Canvas — Neural Network Particles ─────────── */
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  // Mouse parallax
  let mouseX = W / 2, mouseY = H / 2;
  document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

  const NODE_COUNT  = 110;
  const EDGE_DIST   = 160;
  const SIGNAL_SPEED = 2.5;

  const CYAN   = [34, 211, 238];
  const PURPLE = [139, 92, 246];

  function lerpColor(a, b, t) {
    return `rgba(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)},`;
  }

  class Node {
    constructor() { this.reset(); }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = (Math.random() - 0.5) * 0.35;
      this.r  = Math.random() * 2 + 1;
      this.t  = Math.random(); // color interpolation 0=cyan, 1=purple
      this.pulsePhase = Math.random() * Math.PI * 2;
    }
    update() {
      const parallaxX = (mouseX / W - 0.5) * 18;
      const parallaxY = (mouseY / H - 0.5) * 18;
      this.x += this.vx + parallaxX * 0.002;
      this.y += this.vy + parallaxY * 0.002;
      if (this.x < -30) this.x = W + 30;
      if (this.x > W+30) this.x = -30;
      if (this.y < -30) this.y = H + 30;
      if (this.y > H+30) this.y = -30;
    }
    draw(time) {
      const pulse = Math.sin(time * 0.002 + this.pulsePhase) * 0.5 + 0.5;
      const alpha = 0.3 + pulse * 0.5;
      const col   = lerpColor(CYAN, PURPLE, this.t);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + pulse * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = col + alpha + ')';
      ctx.fill();
      // glow
      ctx.beginPath();
      ctx.arc(this.x, this.y, (this.r + pulse * 1.2) * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = col + (alpha * 0.12) + ')';
      ctx.fill();
    }
  }

  class Signal {
    constructor(from, to) {
      this.from = from;
      this.to   = to;
      this.progress = 0;
      this.t = Math.random();
    }
    update() { this.progress += SIGNAL_SPEED / Math.hypot(this.to.x - this.from.x, this.to.y - this.from.y); }
    done() { return this.progress >= 1; }
    draw() {
      const px = this.from.x + (this.to.x - this.from.x) * this.progress;
      const py = this.from.y + (this.to.y - this.from.y) * this.progress;
      const col = lerpColor(CYAN, PURPLE, this.t);
      const grd = ctx.createRadialGradient(px, py, 0, px, py, 6);
      grd.addColorStop(0,   col + '1)');
      grd.addColorStop(0.4, col + '0.5)');
      grd.addColorStop(1,   col + '0)');
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }
  }

  const nodes   = Array.from({ length: NODE_COUNT }, () => new Node());
  const signals = [];
  let lastSignalTime = 0;

  function spawnSignal() {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const b = nodes[Math.floor(Math.random() * nodes.length)];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 40 && d < EDGE_DIST * 1.8) signals.push(new Signal(a, b));
  }

  function heroLoop(time) {
    ctx.clearRect(0, 0, W, H);

    // Subtle radial gradient bg
    const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7);
    grd.addColorStop(0,   'rgba(34, 211, 238, 0.03)');
    grd.addColorStop(0.5, 'rgba(139, 92, 246, 0.02)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const d  = Math.hypot(dx, dy);
        if (d < EDGE_DIST) {
          const alpha = (1 - d / EDGE_DIST) * 0.15;
          const mid   = 0.5 + (nodes[i].t + nodes[j].t) / 4;
          const col   = lerpColor(CYAN, PURPLE, mid);
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = col + alpha + ')';
          ctx.lineWidth   = 0.6;
          ctx.stroke();
        }
      }
    }

    // Update & draw
    nodes.forEach(n => { n.update(); n.draw(time); });

    // Signals
    if (time - lastSignalTime > 320) {
      spawnSignal(); lastSignalTime = time;
    }
    for (let i = signals.length - 1; i >= 0; i--) {
      signals[i].update();
      signals[i].draw();
      if (signals[i].done()) signals.splice(i, 1);
    }

    requestAnimationFrame(heroLoop);
  }
  requestAnimationFrame(heroLoop);

  /* ── Reliability Diagram Canvas ─────────────────────── */
  const rcCanvas = document.getElementById('reliability-canvas');
  if (rcCanvas) {
    const rc = rcCanvas.getContext('2d');
    const bins = 10;

    // Model outputs (approx from our calibration data)
    // These are "before" and "after" calibration accuracy-per-bin
    const binCenters = Array.from({ length: bins }, (_, i) => (i + 0.5) / bins);
    const beforeAcc  = [0.08, 0.14, 0.22, 0.31, 0.42, 0.53, 0.60, 0.68, 0.74, 0.80];
    const afterAcc   = [0.11, 0.21, 0.32, 0.41, 0.52, 0.61, 0.71, 0.80, 0.89, 0.96];

    function drawReliability() {
      const W = rcCanvas.width  = rcCanvas.offsetWidth;
      const H = rcCanvas.height = rcCanvas.offsetHeight;

      const pad = { top: 20, right: 20, bottom: 40, left: 48 };
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top  - pad.bottom;

      rc.clearRect(0, 0, W, H);

      const mapX = v => pad.left + v * pw;
      const mapY = v => pad.top  + (1 - v) * ph;

      // Grid lines
      rc.lineWidth = 0.5;
      rc.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i <= 4; i++) {
        const y = mapY(i / 4);
        rc.beginPath(); rc.moveTo(pad.left, y); rc.lineTo(pad.left + pw, y); rc.stroke();
        rc.fillStyle = 'rgba(150,160,180,0.5)';
        rc.font = '10px Inter, sans-serif';
        rc.textAlign = 'right';
        rc.fillText((i * 25) + '%', pad.left - 6, y + 3.5);
      }
      // x-axis labels
      rc.textAlign = 'center';
      [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
        rc.fillStyle = 'rgba(150,160,180,0.5)';
        rc.fillText((v * 100).toFixed(0) + '%', mapX(v), H - pad.bottom + 16);
      });

      // Perfect calibration diagonal
      rc.beginPath();
      rc.setLineDash([4, 4]);
      rc.strokeStyle = 'rgba(255,255,255,0.18)';
      rc.lineWidth = 1;
      rc.moveTo(mapX(0), mapY(0));
      rc.lineTo(mapX(1), mapY(1));
      rc.stroke();
      rc.setLineDash([]);

      // Bars — before calibration (red tinted)
      const bw = pw / bins;
      beforeAcc.forEach((acc, i) => {
        const x = mapX(i / bins);
        const y = mapY(acc);
        const h = mapY(0) - y;
        rc.fillStyle = 'rgba(239, 68, 68, 0.18)';
        rc.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        rc.lineWidth = 1;
        rc.beginPath();
        rc.roundRect ? rc.roundRect(x + 2, y, bw / 2 - 4, h, 3)
                     : rc.rect(x + 2, y, bw / 2 - 4, h);
        rc.fill();
        rc.stroke();
      });

      // Bars — after calibration (cyan)
      afterAcc.forEach((acc, i) => {
        const x = mapX(i / bins) + bw / 2;
        const y = mapY(acc);
        const h = mapY(0) - y;
        rc.fillStyle = 'rgba(34, 211, 238, 0.18)';
        rc.strokeStyle = 'rgba(34, 211, 238, 0.7)';
        rc.lineWidth = 1;
        rc.beginPath();
        rc.roundRect ? rc.roundRect(x + 2, y, bw / 2 - 4, h, 3)
                     : rc.rect(x + 2, y, bw / 2 - 4, h);
        rc.fill();
        rc.stroke();
      });

      // Line — after
      rc.beginPath();
      rc.strokeStyle = 'rgba(34, 211, 238, 0.9)';
      rc.lineWidth = 2;
      afterAcc.forEach((acc, i) => {
        const x = mapX((i + 0.5) / bins);
        const y = mapY(acc);
        i === 0 ? rc.moveTo(x, y) : rc.lineTo(x, y);
      });
      rc.stroke();

      // Axis labels
      rc.save();
      rc.translate(12, pad.top + ph / 2);
      rc.rotate(-Math.PI / 2);
      rc.textAlign = 'center';
      rc.fillStyle = 'rgba(150,160,180,0.6)';
      rc.font = '11px Inter, sans-serif';
      rc.fillText('Accuracy', 0, 0);
      rc.restore();

      rc.textAlign = 'center';
      rc.fillStyle = 'rgba(150,160,180,0.6)';
      rc.fillText('Confidence', pad.left + pw / 2, H - 4);
    }

    drawReliability();
    new ResizeObserver(drawReliability).observe(rcCanvas);
  }

  /* ── Smooth anchor links ────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
