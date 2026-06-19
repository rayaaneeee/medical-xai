/* ═══════════════════════════════════════════
   DermAI — main.js
   Particles · scroll · cursor · counters
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Scroll progress bar ──────────────────── */
  const bar = document.getElementById('scroll-bar');
  window.addEventListener('scroll', () => {
    const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    if (bar) bar.style.width = (pct * 100) + '%';
  }, { passive: true });

  /* ── Navbar scroll ────────────────────────── */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  /* ── Custom cursor ────────────────────────── */
  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursor-dot');
  let mx = -200, my = -200, cx = -200, cy = -200;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  (function animateCursor() {
    cx += (mx - cx) * 0.13;
    cy += (my - cy) * 0.13;
    if (cursor)    cursor.style.transform    = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
    if (cursorDot) cursorDot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    requestAnimationFrame(animateCursor);
  })();

  /* ── Scroll reveal ────────────────────────── */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const d = +e.target.dataset.delay || 0;
        setTimeout(() => e.target.classList.add('visible'), d);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ── Stat counters ────────────────────────── */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function countUp(el) {
    const target = parseFloat(el.dataset.target);
    const dec    = el.dataset.decimals ? +el.dataset.decimals : 0;
    const dur    = 1800;
    const start  = performance.now();
    (function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = (target * easeOut(p)).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }
  const statsObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('[data-target]').forEach(countUp);
        statsObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.hero-stats-strip').forEach(el => statsObs.observe(el));

  /* ── Smooth anchor links ──────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  /* ══════════════════════════════════════════
     HERO CANVAS — ambient floating particles
  ══════════════════════════════════════════ */
  (function heroParticles() {
    const c = document.getElementById('hero-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    let W, H;

    function resize() {
      W = c.width  = c.offsetWidth  || c.parentElement.offsetWidth  || 500;
      H = c.height = c.offsetHeight || c.parentElement.offsetHeight || 620;
    }
    resize();
    new ResizeObserver(resize).observe(c.parentElement);

    const pts = Array.from({ length: 55 }, () => ({
      x:  Math.random() * 1200,
      y:  Math.random() * 700,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.18 - 0.05,
      r:  Math.random() * 1.6 + 0.4,
      a:  Math.random() * 0.35 + 0.08,
      hue: Math.random() > 0.5 ? '56,189,248' : '20,184,166'
    }));

    function draw() {
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue},${p.a})`;
        ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 95) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(56,189,248,${0.055 * (1 - d / 95)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }
    draw();
  })();

  /* ── Doctor SVG idle bob ──────────────────── */
  (function doctorIdle() {
    const illus = document.querySelector('.doctor-illus');
    if (!illus) return;
    let t = 0;
    (function tick() {
      requestAnimationFrame(tick);
      t += 0.018;
      illus.style.transform = `translateY(${Math.sin(t * 0.7) * 5}px)`;
    })();
  })();

  /* ══════════════════════════════════════════
     RELIABILITY DIAGRAM CANVAS
  ══════════════════════════════════════════ */
  const rcCanvas = document.getElementById('reliability-canvas');
  if (rcCanvas) {
    const rc = rcCanvas.getContext('2d');

    const beforeAcc = [0.08, 0.14, 0.22, 0.31, 0.42, 0.53, 0.60, 0.68, 0.74, 0.80];
    const afterAcc  = [0.11, 0.21, 0.32, 0.41, 0.52, 0.61, 0.71, 0.80, 0.89, 0.96];
    const bins = 10;

    function drawReliability() {
      const W = rcCanvas.width  = rcCanvas.offsetWidth  || 320;
      const H = rcCanvas.height = rcCanvas.offsetHeight || 240;
      const pad = { top:18, right:18, bottom:38, left:46 };
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top  - pad.bottom;

      rc.clearRect(0, 0, W, H);
      const mapX = v => pad.left + v * pw;
      const mapY = v => pad.top  + (1 - v) * ph;

      // Grid
      rc.lineWidth = 0.5;
      rc.strokeStyle = 'rgba(56,189,248,0.08)';
      [0,0.25,0.5,0.75,1].forEach(v => {
        const y = mapY(v);
        rc.beginPath(); rc.moveTo(pad.left, y); rc.lineTo(pad.left + pw, y); rc.stroke();
        rc.fillStyle = 'rgba(255,255,255,0.3)';
        rc.font = '10px Inter, sans-serif'; rc.textAlign = 'right';
        rc.fillText((v * 100).toFixed(0) + '%', pad.left - 6, y + 3.5);
      });
      [0,0.25,0.5,0.75,1].forEach(v => {
        rc.fillStyle = 'rgba(255,255,255,0.3)';
        rc.textAlign = 'center';
        rc.fillText((v * 100).toFixed(0) + '%', mapX(v), H - pad.bottom + 16);
      });

      // Perfect calibration diagonal
      rc.beginPath(); rc.setLineDash([4,4]);
      rc.strokeStyle = 'rgba(255,255,255,0.15)'; rc.lineWidth = 1;
      rc.moveTo(mapX(0), mapY(0)); rc.lineTo(mapX(1), mapY(1)); rc.stroke();
      rc.setLineDash([]);

      const bw = pw / bins;

      // Before bars (red)
      beforeAcc.forEach((acc, i) => {
        const x = mapX(i / bins);
        const y = mapY(acc); const h = mapY(0) - y;
        rc.fillStyle = 'rgba(239,68,68,0.15)'; rc.strokeStyle = 'rgba(239,68,68,0.5)';
        rc.lineWidth = 1;
        rc.beginPath();
        if (rc.roundRect) rc.roundRect(x + 2, y, bw / 2 - 4, h, 3);
        else rc.rect(x + 2, y, bw / 2 - 4, h);
        rc.fill(); rc.stroke();
      });

      // After bars (teal)
      afterAcc.forEach((acc, i) => {
        const x = mapX(i / bins) + bw / 2;
        const y = mapY(acc); const h = mapY(0) - y;
        rc.fillStyle = 'rgba(20,184,166,0.18)'; rc.strokeStyle = 'rgba(20,184,166,0.7)';
        rc.lineWidth = 1;
        rc.beginPath();
        if (rc.roundRect) rc.roundRect(x + 2, y, bw / 2 - 4, h, 3);
        else rc.rect(x + 2, y, bw / 2 - 4, h);
        rc.fill(); rc.stroke();
      });

      // After line
      rc.beginPath();
      rc.strokeStyle = 'rgba(20,184,166,0.9)'; rc.lineWidth = 2;
      afterAcc.forEach((acc, i) => {
        const x = mapX((i + 0.5) / bins);
        i === 0 ? rc.moveTo(x, mapY(acc)) : rc.lineTo(x, mapY(acc));
      });
      rc.stroke();

      // Axis labels
      rc.save(); rc.translate(12, pad.top + ph / 2); rc.rotate(-Math.PI / 2);
      rc.textAlign = 'center'; rc.fillStyle = 'rgba(255,255,255,0.3)';
      rc.font = '11px Inter, sans-serif'; rc.fillText('Accuracy', 0, 0);
      rc.restore();
      rc.textAlign = 'center'; rc.fillStyle = 'rgba(255,255,255,0.3)';
      rc.fillText('Confidence', pad.left + pw / 2, H - 4);
    }

    drawReliability();
    new ResizeObserver(drawReliability).observe(rcCanvas);
  }

})();
