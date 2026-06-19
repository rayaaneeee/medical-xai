/* ═══════════════════════════════════════════
   DermAI — main.js
   Three.js 3D doctor · scroll · cursor · counters
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

  /* ═══════════════════════════════════════════
     THREE.JS — 3D HOLOGRAPHIC DOCTOR
  ═══════════════════════════════════════════ */
  const canvas3D = document.getElementById('three-canvas');
  if (!canvas3D || typeof THREE === 'undefined') return;

  const W = () => canvas3D.clientWidth;
  const H = () => canvas3D.clientHeight;

  const renderer = new THREE.WebGLRenderer({ canvas: canvas3D, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 100);
  camera.position.set(0, 1.2, 6.5);
  camera.lookAt(0, 0.8, 0);

  function onResize() {
    renderer.setSize(W(), H());
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
  }
  onResize();
  new ResizeObserver(onResize).observe(canvas3D);

  /* ── Lights ── */
  const ambient = new THREE.AmbientLight(0x0a1f3d, 2.5);
  scene.add(ambient);

  const blueLight = new THREE.PointLight(0x38bdf8, 5, 12);
  blueLight.position.set(-3, 4, 3);
  scene.add(blueLight);

  const tealLight = new THREE.PointLight(0x14b8a6, 4, 12);
  tealLight.position.set(3, 2, 2);
  scene.add(tealLight);

  const rimLight = new THREE.PointLight(0x1a6bcc, 2, 10);
  rimLight.position.set(0, -1, -4);
  scene.add(rimLight);

  const topLight = new THREE.DirectionalLight(0xdcf5ff, 1.2);
  topLight.position.set(0, 6, 4);
  scene.add(topLight);

  /* ── Materials ── */
  function mat(color, emissive, emissiveInt = 0.3, opacity = 1) {
    return new THREE.MeshPhongMaterial({ color, emissive, emissiveIntensity: emissiveInt,
      shininess: 80, transparent: opacity < 1, opacity });
  }
  function wireMat(color, op = 0.25) {
    return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: op });
  }

  const skinM  = mat(0x14b8a6, 0x0a5c56, 0.4);
  const coatM  = mat(0xdcf5ff, 0x1a6bcc, 0.08);
  const pantM  = mat(0x0c2d5e, 0x091525, 0.2);
  const stethM = mat(0x38bdf8, 0x0ea5e9, 0.6);
  const wireM  = wireMat(0x14b8a6, 0.18);

  /* ── Doctor group ── */
  const doctor = new THREE.Group();

  function addWire(geo, parent) {
    const w = new THREE.Mesh(geo, wireM);
    w.scale.multiplyScalar(1.025);
    parent.add(w);
  }

  // Head
  const headGeo  = new THREE.SphereGeometry(0.44, 20, 20);
  const head     = new THREE.Mesh(headGeo, skinM);
  head.position.y = 2.25;
  addWire(headGeo, head);
  doctor.add(head);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 12), skinM);
  neck.position.y = 1.72;
  doctor.add(neck);

  // Torso / white coat
  const torsoGeo = new THREE.BoxGeometry(0.90, 1.35, 0.38);
  const torso    = new THREE.Mesh(torsoGeo, coatM);
  torso.position.y = 0.88;
  addWire(torsoGeo, torso);
  doctor.add(torso);

  // Coat collar notch (small blue triangle shape)
  const collarGeo = new THREE.BoxGeometry(0.22, 0.55, 0.40);
  const collar    = new THREE.Mesh(collarGeo, mat(0x0c2d5e, 0x091525, 0.3));
  collar.position.set(0, 1.32, 0.01);
  doctor.add(collar);

  // Coat pocket
  const pocketGeo = new THREE.BoxGeometry(0.18, 0.13, 0.02);
  const pocket    = new THREE.Mesh(pocketGeo, mat(0x38bdf8, 0x0ea5e9, 0.3));
  pocket.position.set(0.26, 0.98, 0.20);
  doctor.add(pocket);

  // Stethoscope (torus around shoulders)
  const stethGeo = new THREE.TorusGeometry(0.26, 0.030, 10, 40);
  const steth    = new THREE.Mesh(stethGeo, stethM);
  steth.position.set(0, 1.6, 0.12);
  steth.rotation.x = Math.PI / 3.5;
  doctor.add(steth);

  // Stethoscope ear pieces
  [-0.18, 0.18].forEach(x => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), stethM);
    ear.position.set(x, 1.85, 0.18);
    doctor.add(ear);
  });

  // Left arm
  const armGeo = new THREE.CylinderGeometry(0.115, 0.095, 1.05, 10);
  const lArm   = new THREE.Mesh(armGeo, coatM);
  lArm.position.set(-0.58, 0.82, 0);
  lArm.rotation.z = 0.12;
  doctor.add(lArm);

  // Right arm (slightly forward, holding clipboard)
  const rArm = new THREE.Mesh(armGeo, coatM);
  rArm.position.set(0.58, 0.82, 0);
  rArm.rotation.z = -0.12;
  doctor.add(rArm);

  // Hands
  [-0.62, 0.62].forEach((x, i) => {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skinM);
    hand.position.set(x * 0.98, 0.24, i === 1 ? 0.1 : 0);
    doctor.add(hand);
  });

  // Clipboard (right hand)
  const clipGeo = new THREE.BoxGeometry(0.28, 0.35, 0.04);
  const clip    = new THREE.Mesh(clipGeo, mat(0xf0f9ff, 0x38bdf8, 0.04));
  clip.position.set(0.60, 0.42, 0.14);
  clip.rotation.z = -0.08;
  doctor.add(clip);

  // Clipboard lines
  for (let i = 0; i < 4; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.045),
      mat(0x38bdf8, 0x0ea5e9, 0.5));
    line.position.set(0.60, 0.50 - i * 0.055, 0.165);
    line.rotation.z = -0.08;
    doctor.add(line);
  }

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.16, 0.13, 1.30, 10);
  [-0.22, 0.22].forEach(x => {
    const leg = new THREE.Mesh(legGeo, pantM);
    leg.position.set(x, -0.38, 0);
    doctor.add(leg);
  });

  // Shoes
  [-0.24, 0.24].forEach(x => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.30),
      mat(0x060f1e, 0x1a6bcc, 0.1));
    shoe.position.set(x, -1.07, 0.06);
    doctor.add(shoe);
  });

  // Cross badge on coat
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.025), mat(0xef4444, 0xff0000, 0.5));
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.025), mat(0xef4444, 0xff0000, 0.5));
  crossH.position.set(-0.26, 1.14, 0.21);
  crossV.position.set(-0.26, 1.14, 0.21);
  doctor.add(crossH);
  doctor.add(crossV);

  doctor.position.y = -0.5;
  scene.add(doctor);

  /* ── Floating medical cross ── */
  const floatGroup = new THREE.Group();
  const fH = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.04), mat(0x38bdf8, 0x0ea5e9, 0.7));
  const fV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.04), mat(0x38bdf8, 0x0ea5e9, 0.7));
  floatGroup.add(fH); floatGroup.add(fV);
  floatGroup.position.set(1.6, 2.2, 0);
  scene.add(floatGroup);

  /* ── DNA Helix ── */
  const dnaGroup = new THREE.Group();
  const N = 50, dnaRadius = 0.45, dnaHeight = 3.6;
  const blueDNA  = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const tealDNA  = new THREE.MeshBasicMaterial({ color: 0x14b8a6 });
  const barDNA   = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  const s1geo = new THREE.SphereGeometry(0.055, 8, 8);
  const s2geo = new THREE.SphereGeometry(0.055, 8, 8);

  for (let i = 0; i < N; i++) {
    const t     = i / N;
    const angle = t * Math.PI * 5;
    const y     = (t - 0.5) * dnaHeight;

    const s1 = new THREE.Mesh(s1geo, blueDNA);
    s1.position.set(dnaRadius * Math.cos(angle), y, dnaRadius * Math.sin(angle));
    dnaGroup.add(s1);

    const s2 = new THREE.Mesh(s2geo, tealDNA);
    s2.position.set(dnaRadius * Math.cos(angle + Math.PI), y, dnaRadius * Math.sin(angle + Math.PI));
    dnaGroup.add(s2);

    if (i % 5 === 0) {
      const barGeo = new THREE.CylinderGeometry(0.018, 0.018, dnaRadius * 2, 4);
      const bar    = new THREE.Mesh(barGeo, barDNA);
      bar.position.set(0, y, 0);
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = angle;
      dnaGroup.add(bar);
    }
  }

  dnaGroup.position.set(-2.4, -0.3, -0.5);
  scene.add(dnaGroup);

  /* ── Ambient medical particles ── */
  const partCount = 80;
  const partGeo   = new THREE.BufferGeometry();
  const partPos   = new Float32Array(partCount * 3);
  const partVel   = [];

  for (let i = 0; i < partCount; i++) {
    partPos[i * 3]     = (Math.random() - 0.5) * 7;
    partPos[i * 3 + 1] = (Math.random() - 0.5) * 5 + 1;
    partPos[i * 3 + 2] = (Math.random() - 0.5) * 3 - 1;
    partVel.push({
      x: (Math.random() - 0.5) * 0.004,
      y: (Math.random() - 0.5) * 0.004,
      z: 0
    });
  }
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  const particles = new THREE.Points(
    partGeo,
    new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.055, transparent: true, opacity: 0.55 })
  );
  scene.add(particles);

  /* ── Platform / floor ring ── */
  const ringGeo = new THREE.RingGeometry(0.8, 1.3, 48);
  const ring    = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0x14b8a6, transparent: true, opacity: 0.12, side: THREE.DoubleSide
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.5;
  scene.add(ring);

  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.6, 48),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = -1.5;
  scene.add(ring2);

  /* ── Mouse parallax ── */
  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ── Render loop ── */
  let t = 0;
  (function render() {
    requestAnimationFrame(render);
    t += 0.012;

    // Doctor breathing / idle sway
    doctor.rotation.y = Math.sin(t * 0.4) * 0.08 + mouseX * 0.12;
    doctor.position.y = -0.5 + Math.sin(t * 0.6) * 0.06;
    head.rotation.y   = Math.sin(t * 0.3) * 0.12;
    head.rotation.x   = Math.sin(t * 0.25) * 0.05 - mouseY * 0.06;

    // Arm swing
    lArm.rotation.z = 0.12 + Math.sin(t * 0.5) * 0.04;
    rArm.rotation.z = -0.12 - Math.sin(t * 0.5) * 0.04;

    // DNA spin
    dnaGroup.rotation.y = t * 0.35;

    // Floating cross bob
    floatGroup.position.y = 2.2 + Math.sin(t * 0.8) * 0.18;
    floatGroup.rotation.y = t * 0.6;
    floatGroup.rotation.z = Math.sin(t * 0.4) * 0.15;

    // Platform rings pulse
    ring.material.opacity  = 0.08 + Math.sin(t * 1.2) * 0.05;
    ring2.material.opacity = 0.04 + Math.sin(t * 1.0) * 0.03;

    // Particle drift
    const posArr = partGeo.attributes.position.array;
    for (let i = 0; i < partCount; i++) {
      posArr[i * 3]     += partVel[i].x;
      posArr[i * 3 + 1] += partVel[i].y + 0.003;
      if (posArr[i * 3 + 1] > 3.5) posArr[i * 3 + 1] = -2.5;
      if (Math.abs(posArr[i * 3]) > 3.8) partVel[i].x *= -1;
    }
    partGeo.attributes.position.needsUpdate = true;

    // Light animation
    blueLight.position.x = Math.sin(t * 0.4) * 3;
    blueLight.position.z = Math.cos(t * 0.3) * 2 + 3;
    tealLight.position.x = Math.cos(t * 0.35) * 3;

    // Camera slight parallax
    camera.position.x += (mouseX * 0.25 - camera.position.x) * 0.03;
    camera.position.y += (-mouseY * 0.15 + 1.2 - camera.position.y) * 0.03;
    camera.lookAt(0, 0.8, 0);

    renderer.render(scene, camera);
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
