/* ═══════════════════════════════════════════════════════
   DermAI — demo.js
   Handles: dropzone, example thumbnails, API calls,
            results rendering (images, probs, gauge)
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── DOM refs ──────────────────────────────────────── */
  const dropzone      = document.getElementById('dropzone');
  const dzInner       = document.getElementById('dz-inner');
  const fileInput     = document.getElementById('file-input');
  const browseBtn     = document.getElementById('browse-btn');
  const previewImg    = document.getElementById('preview-img');
  const scanLine      = document.getElementById('scan-line');
  const examplesGrid  = document.getElementById('examples-grid');
  const camBtns       = document.querySelectorAll('.seg-btn[data-val]');
  const passesSlider  = document.getElementById('mc-passes');
  const passesVal     = document.getElementById('passes-val');
  const analyzeBtn    = document.getElementById('analyze-btn');
  const btnText       = analyzeBtn && analyzeBtn.querySelector('#btn-text');
  const btnLoader     = analyzeBtn && analyzeBtn.querySelector('.btn-loader');
  const resultsEmpty  = document.getElementById('results-empty');
  const resultsContent= document.getElementById('results-content');
  const gaugeCanvas   = document.getElementById('gauge-canvas');

  // Result value elements
  const resOriginal   = document.getElementById('res-original');
  const resGradcam    = document.getElementById('res-gradcam');
  const resPredName   = document.getElementById('pred-name');
  const resPredConf   = document.getElementById('pred-conf');
  const resProbsList  = document.getElementById('probs-list');
  const resUncertVal  = document.getElementById('metric-uncertainty');
  const resUncertLevel= document.getElementById('metric-unc-label');
  const resTempVal    = document.getElementById('metric-temp');
  const resPassesVal  = document.getElementById('metric-passes');

  /* ── State ─────────────────────────────────────────── */
  let selectedFile    = null;
  let selectedExample = null;  // { name, thumb, dataUrl }
  let camMethod       = 'gradcam';
  let nPasses         = 30;

  /* ── MC Passes slider ──────────────────────────────── */
  if (passesSlider) {
    passesSlider.addEventListener('input', () => {
      nPasses = +passesSlider.value;
      if (passesVal) passesVal.textContent = nPasses;
    });
  }

  /* ── CAM method segmented control ─────────────────── */
  camBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      camBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      camMethod = btn.dataset.val;
    });
  });

  /* ── File drop + browse ────────────────────────────── */
  if (browseBtn) browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fileInput) fileInput.click();
  });

  if (dropzone) {
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) setFile(file);
    });
    dropzone.addEventListener('click', () => {
      if (fileInput && !dropzone.classList.contains('has-image')) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) setFile(file);
    });
  }

  function setFile(file) {
    selectedFile    = file;
    selectedExample = null;
    document.querySelectorAll('.example-thumb').forEach(el => el.classList.remove('selected'));
    const reader = new FileReader();
    reader.onload = e => showPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  function showPreview(dataUrl) {
    if (previewImg) {
      previewImg.src = dataUrl;
      previewImg.classList.remove('hidden');
      if (dzInner) dzInner.style.display = 'none';
      if (dropzone) dropzone.classList.add('has-image');
    }
    if (analyzeBtn) analyzeBtn.disabled = false;
  }

  /* ── Load examples from API ────────────────────────── */
  function loadExamples() {
    if (!examplesGrid) return;
    examplesGrid.innerHTML = Array(9).fill(null)
      .map(() => `<div class="example-skeleton"></div>`).join('');

    fetch('/api/examples')
      .then(r => r.json())
      .then(data => {
        examplesGrid.innerHTML = '';
        if (!data.images || !data.images.length) {
          examplesGrid.innerHTML = '<p style="color:var(--text3);font-size:.8rem;grid-column:span 9">No examples available</p>';
          return;
        }
        data.images.forEach(img => {
          const div = document.createElement('div');
          div.className = 'example-thumb';
          const image = document.createElement('img');
          image.src = 'data:image/jpeg;base64,' + img.thumb;
          image.alt = img.name;
          image.draggable = false;
          div.appendChild(image);
          div.addEventListener('click', () => selectExample(div, img, image.src));
          examplesGrid.appendChild(div);
        });
      })
      .catch(() => {
        examplesGrid.innerHTML = '<p style="color:var(--text3);font-size:.8rem;grid-column:span 9">Could not load examples</p>';
      });
  }

  function selectExample(el, imgData, dataUrl) {
    document.querySelectorAll('.example-thumb').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    selectedFile    = null;
    selectedExample = { name: imgData.name, thumb: imgData.thumb, dataUrl };
    showPreview(dataUrl);
    if (fileInput) fileInput.value = '';
  }

  loadExamples();

  /* ── Analyze ────────────────────────────────────────── */
  if (analyzeBtn) analyzeBtn.addEventListener('click', runAnalysis);

  async function runAnalysis() {
    if (!selectedFile && !selectedExample) {
      shakeDropzone(); return;
    }

    setLoading(true);

    if (scanLine) {
      scanLine.classList.remove('scanning');
      void scanLine.offsetWidth;
      scanLine.classList.add('scanning');
    }

    const formData = new FormData();
    formData.append('dataset',    'isic');
    formData.append('cam_method', camMethod);
    formData.append('n_passes',   nPasses);

    if (selectedFile) {
      formData.append('file', selectedFile);
    } else {
      const blob = b64ToBlob(selectedExample.thumb, 'image/jpeg');
      formData.append('file', blob, selectedExample.name + '.jpg');
    }

    try {
      const res = await fetch('/api/predict', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(err.detail || 'Server error');
      }
      const data = await res.json();
      renderResults(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    if (!analyzeBtn) return;
    analyzeBtn.disabled = loading;
    const textEl = analyzeBtn.querySelector('span');
    if (textEl) textEl.textContent = loading ? 'Analyzing…' : 'Analyze Image';
    if (btnLoader) btnLoader.classList.toggle('hidden', !loading);
  }

  function shakeDropzone() {
    if (!dropzone) return;
    dropzone.style.borderColor = 'rgba(239,68,68,0.6)';
    setTimeout(() => { dropzone.style.borderColor = ''; }, 700);
  }

  function showError(msg) {
    if (resultsContent) resultsContent.classList.add('hidden');
    if (resultsEmpty) {
      resultsEmpty.style.display = 'flex';
      resultsEmpty.innerHTML = `
        <svg width="48" height="48" fill="none" stroke="#ef4444" stroke-width="1.5" viewBox="0 0 24 24" opacity=".7">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <p style="color:#f87171;margin:0">${msg}</p>
        <p style="margin:0">Make sure the server is running and try again.</p>
      `;
    }
  }

  /* ── Render results ─────────────────────────────────── */
  function renderResults(data) {
    if (resultsEmpty) resultsEmpty.style.display = 'none';
    if (resultsContent) resultsContent.classList.remove('hidden');

    if (resOriginal) resOriginal.src = 'data:image/jpeg;base64,' + data.original_b64;
    if (resGradcam)  resGradcam.src  = 'data:image/jpeg;base64,' + data.gradcam_b64;

    if (resPredName) resPredName.textContent = data.prediction;
    if (resPredConf) resPredConf.textContent = `Confidence: ${(data.confidence * 100).toFixed(1)}%`;

    if (resProbsList) {
      resProbsList.innerHTML = '';
      data.probabilities.forEach((p, idx) => {
        const pct = (p.prob * 100).toFixed(1);
        const isTop = idx === 0;
        const row = document.createElement('div');
        row.className = 'prob-row';
        const hue = isTop
          ? 'linear-gradient(90deg, #22d3ee, #8b5cf6)'
          : 'rgba(120,160,220,0.35)';
        row.innerHTML = `
          <span class="prob-name" title="${p.name}">${p.name}</span>
          <div class="prob-track">
            <div class="prob-fill" style="background:${hue};width:0"></div>
          </div>
          <span class="prob-pct">${pct}%</span>
        `;
        resProbsList.appendChild(row);
        requestAnimationFrame(() => {
          const fill = row.querySelector('.prob-fill');
          if (fill) {
            fill.style.transition = `width 0.9s cubic-bezier(0.16,1,0.3,1) ${idx * 60}ms`;
            fill.style.width = (p.prob * 100) + '%';
          }
        });
      });
    }

    const uncPct = data.uncertainty_pct || 0;
    if (resUncertVal) resUncertVal.textContent = uncPct.toFixed(1) + '%';
    if (resUncertLevel) {
      const level = uncPct < 25 ? 'Low' : uncPct < 55 ? 'Moderate' : 'High';
      const color = uncPct < 25 ? '#10b981'  : uncPct < 55 ? '#f59e0b'  : '#ef4444';
      resUncertLevel.textContent = level;
      resUncertLevel.style.color = color;
    }
    drawGauge(uncPct);

    if (resTempVal)   resTempVal.textContent   = data.temperature.toFixed(4);
    if (resPassesVal) resPassesVal.textContent = data.n_passes;

    setTimeout(() => {
      resultsContent && resultsContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  /* ── Uncertainty Gauge ──────────────────────────────── */
  function drawGauge(pct) {
    if (!gaugeCanvas) return;
    const gc = gaugeCanvas.getContext('2d');
    const W  = gaugeCanvas.width  = gaugeCanvas.offsetWidth  || 80;
    const H  = gaugeCanvas.height = gaugeCanvas.offsetHeight || 80;

    gc.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.78;
    const r  = Math.min(W * 0.4, H * 0.6);
    const startA = Math.PI, endA = 2 * Math.PI;
    const fillA  = startA + (pct / 100) * Math.PI;

    // Track
    gc.beginPath(); gc.arc(cx, cy, r, startA, endA);
    gc.strokeStyle = 'rgba(255,255,255,0.08)'; gc.lineWidth = 8; gc.lineCap = 'round'; gc.stroke();

    // Fill
    const col = pct < 25 ? '#10b981' : pct < 55 ? '#f59e0b' : '#ef4444';
    if (pct > 0) {
      gc.beginPath(); gc.arc(cx, cy, r, startA, fillA);
      gc.strokeStyle = col; gc.lineWidth = 8; gc.lineCap = 'round';
      gc.shadowColor = col; gc.shadowBlur = 8;
      gc.stroke(); gc.shadowBlur = 0;
    }

    // Needle
    const nx = cx + (r - 4) * Math.cos(fillA);
    const ny = cy + (r - 4) * Math.sin(fillA);
    gc.beginPath(); gc.moveTo(cx, cy); gc.lineTo(nx, ny);
    gc.strokeStyle = col; gc.lineWidth = 1.5; gc.lineCap = 'round'; gc.stroke();

    // Center
    gc.beginPath(); gc.arc(cx, cy, 3.5, 0, Math.PI * 2);
    gc.fillStyle = col; gc.fill();
  }

  /* ── Idle canvas (waiting animation) ───────────────── */
  const idleCanvas = document.getElementById('idle-canvas');
  if (idleCanvas) {
    const ic = idleCanvas.getContext('2d');
    const IW = idleCanvas.width, IH = idleCanvas.height;
    let angle = 0;
    function idleLoop() {
      ic.clearRect(0, 0, IW, IH);
      const cx = IW / 2, cy = IH / 2;
      for (let i = 0; i < 6; i++) {
        const a  = angle + (i * Math.PI * 2) / 6;
        const r  = 60;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        const t  = i / 6;
        const alpha = 0.2 + 0.6 * ((Math.sin(angle * 2 + i) + 1) / 2);
        const color = `rgba(${Math.round(34+(139-34)*t)},${Math.round(211+(92-211)*t)},${Math.round(238+(246-238)*t)},${alpha})`;
        ic.beginPath();
        ic.arc(px, py, 5 + 3 * Math.sin(angle + i), 0, Math.PI * 2);
        ic.fillStyle = color;
        ic.fill();
        if (i > 0) {
          const a2 = angle + ((i - 1) * Math.PI * 2) / 6;
          ic.beginPath();
          ic.moveTo(cx + r * Math.cos(a2), cy + r * Math.sin(a2));
          ic.lineTo(px, py);
          ic.strokeStyle = `rgba(34,211,238,${alpha * 0.3})`;
          ic.lineWidth = 1; ic.stroke();
        }
      }
      angle += 0.018;
      requestAnimationFrame(idleLoop);
    }
    idleLoop();
  }

  /* ── Helpers ────────────────────────────────────────── */
  function b64ToBlob(b64, mimeType) {
    const bytes = atob(b64);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
  }

})();
