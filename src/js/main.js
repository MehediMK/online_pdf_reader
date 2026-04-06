window.addEventListener('load', () => {
  if (typeof pdfjsLib === 'undefined') {
    alert('PDF.js failed to load.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = './src/js/pdf.worker.min.js';

  // --- Elements ---
  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const status = document.getElementById('status');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const zoomInBtnEl = document.getElementById('zoomInBtn');
  const zoomOutBtnEl = document.getElementById('zoomOutBtn');
  const zoomLevel = document.getElementById('zoomLevel');
  const pageNumberInput = document.getElementById('pageNumberInput');
  const totalPages = document.getElementById('totalPages');
  const flipbookContainer = document.querySelector('.flipbook-container');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const outlineContainer = document.getElementById('outlineContainer');
  const toggleSoundBtn = document.getElementById('toggleSoundBtn');
  const fitWidthBtn = document.getElementById('fitWidthBtn');
  const fitPageBtn = document.getElementById('fitPageBtn');
  const toggleViewBtn = document.getElementById('toggleViewBtn');
  const nightModeBtn = document.getElementById('nightModeBtn');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const presentationOverlay = document.getElementById('presentationOverlay');
  const presentationPage = document.getElementById('presentationPage');
  const presentationProgress = document.getElementById('presentationProgress');
  const presentationPrev = document.getElementById('presentationPrev');
  const presentationNext = document.getElementById('presentationNext');
  const presentationExit = document.getElementById('presentationExit');
  const presentationBtn = document.getElementById('presentationBtn');
  const emptyState = document.getElementById('emptyState');
  const progressFill = document.getElementById('progressFill');
  const readBadge = document.getElementById('readBadge');
  const resumePrompt = document.getElementById('resumePrompt');
  const resumeBtn = document.getElementById('resumeBtn');

  const flipbook = $('#flipbook');

  // --- State ---
  let pdfDoc = null;
  let currentPdfName = null;
  let currentZoom = 1;
  const minZoom = 0.5;
  const maxZoom = 2.5;
  const zoomStep = 0.1;
  let isDragging = false, startX, startY, translateX = 0, translateY = 0;
  let isSinglePage = false;
  let soundEnabled = true;
  let isPresentationMode = false;
  let presentationHideTimer = null;
  let lastTurnedPage = 1;

  function setStatus(msg) {
    status.textContent = msg;
  }

  function updateZoomBadge() {
    if (zoomLevel) {
      zoomLevel.textContent = `${(currentZoom * 100).toFixed(0)}%`;
    }
  }

  function hideEmptyState() {
    if (emptyState) emptyState.style.display = 'none';
  }

  function showEmptyState() {
    if (emptyState) emptyState.style.display = 'flex';
  }

  // --- Reading Progress ---
  function pdfKey(name) {
    return `pdf_progress_${name}`;
  }

  function loadReadingProgress(name) {
    try {
      const data = localStorage.getItem(pdfKey(name));
      if (!data) return { lastPage: 1, visited: [] };
      return JSON.parse(data);
    } catch {
      return { lastPage: 1, visited: [] };
    }
  }

  function saveReadingProgress(name, pageNum) {
    try {
      const progress = loadReadingProgress(name);
      if (!progress.visited.includes(pageNum)) {
        progress.visited.push(pageNum);
      }
      if (pageNum > progress.lastPage) {
        progress.lastPage = pageNum;
      }
      localStorage.setItem(pdfKey(name), JSON.stringify(progress));
    } catch {}
  }

  function markVisitedPages(totalPages, visited) {
    document.querySelectorAll('.thumbnail.visited').forEach(el => el.classList.remove('visited'));
    visited.forEach(page => {
      const thumb = thumbnailContainer.children[page - 1];
      if (thumb) thumb.classList.add('visited');
    });
  }

  function updateReadPercent(current, total) {
    const pct = Math.floor((current / total) * 100);
    progressFill.style.width = `${pct}%`;
    if (readBadge) {
      readBadge.textContent = `${pct}% read`;
      readBadge.style.display = '';
    }
  }

  // --- Sidebar Toggle (mobile) ---
  let sidebarOpen = false;

  sidebarToggle.addEventListener('click', () => {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('sidebar-open', sidebarOpen);

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.classList.toggle('sidebar-open', sidebarOpen);
    backdrop.onclick = () => {
      sidebarOpen = false;
      sidebar.classList.remove('sidebar-open');
      backdrop.classList.remove('sidebar-open');
    };
  });

  // --- PDF Rendering ---
  async function renderPage(pdf, pageNumber, scale = 1.5) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.9);
    return img;
  }

  async function loadPDF(arrayBuffer) {
    try {
      setStatus('Loading PDF...');
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages.textContent = `/ ${pdfDoc.numPages} pages`;
      pageNumberInput.max = pdfDoc.numPages;

      setStatus(`Rendering ${pdfDoc.numPages} pages...`);
      flipbook.html('');
      thumbnailContainer.innerHTML = '';
      outlineContainer.innerHTML = '';

      hideEmptyState();

      // Compute unique key for this PDF
      currentPdfName = fileInput.files[0] ? (fileInput.files[0].name + '_' + fileInput.files[0].size) : 'unknown';
      const progress = loadReadingProgress(currentPdfName);
      const hasSavedProgress = progress.lastPage > 1 && progress.visited.length > 0;

      // Show resume prompt
      if (hasSavedProgress && resumePrompt) {
        resumePrompt.style.display = 'flex';
        if (resumePrompt.textContent || resumePrompt.querySelector('span')) {
          resumePrompt.innerHTML = `<button id="resumeBtn" class="btn primary resume-btn">Resume from page ${progress.lastPage}</button>`;
          document.getElementById('resumeBtn').addEventListener('click', () => {
            flipbook.turn('page', progress.lastPage);
            resumePrompt.style.display = 'none';
          });
        }
      } else if (resumePrompt) {
        resumePrompt.style.display = 'none';
      }

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageImg = await renderPage(pdfDoc, i);
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.appendChild(pageImg);
        flipbook.append(pageDiv);

        addAnnotationLayer(pageDiv, i);

        const thumbImg = await renderPage(pdfDoc, i, 0.2);
        thumbImg.className = 'thumbnail';
        thumbImg.title = `Page ${i}`;
        thumbImg.addEventListener('click', () => flipbook.turn('page', i));
        thumbnailContainer.appendChild(thumbImg);

        setStatus(`Rendering page ${i} of ${pdfDoc.numPages}...`);
      }

      const outline = await pdfDoc.getOutline();
      if (outline) {
        outline.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item.title;
          li.addEventListener('click', async () => {
            const dest = await pdfDoc.getDestination(item.dest);
            const pageIndex = await pdfDoc.getPageIndex(dest[0]);
            flipbook.turn('page', pageIndex + 1);
          });
          outlineContainer.appendChild(li);
        });
      }

      setTimeout(() => {
        flipbook.turn({
          width: 900,
          height: 600,
          autoCenter: true,
          acceleration: true,
          display: 'double',
          elevation: 50,
          gradients: true,
          duration: 800,
          when: {
            turning: function (event, page, view) {
              if (!soundEnabled) return;
              const flipSound = document.getElementById('flipSound');
              flipSound.currentTime = 0;
              flipSound.play().catch(() => {});

              if (isPresentationMode) {
                updatePresentationPage(page);
              }
            },
            turned: function (event, page, view) {
              pageNumberInput.value = page;
              lastTurnedPage = page;

              if (currentPdfName) {
                saveReadingProgress(currentPdfName, page);
              }
              updateReadPercent(page, pdfDoc.numPages);
              markVisitedPages(pdfDoc.numPages, [page]);
            }
          }
        });

        // Apply saved progress
        if (hasSavedProgress && progress.lastPage <= pdfDoc.numPages) {
          flipbook.turn('page', progress.lastPage);
        }
        updateReadPercent(1, pdfDoc.numPages);

        setStatus(`Loaded ${pdfDoc.numPages} pages.`);
      }, 400);

    } catch (err) {
      console.error(err);
      setStatus('Failed to load PDF.');
    }
  }

  // --- Annotation Layer ---
  const toolFreehandBtn = document.getElementById('toolFreehand');
  const toolHighlightBtn = document.getElementById('toolHighlight');
  const colorPicker = document.getElementById('colorPicker');

  toolFreehandBtn.addEventListener('click', () => {
    $('.page').each((_, pageDiv) => pageDiv.querySelector('.annotationLayer').setTool('freehand'));
  });

  toolHighlightBtn.addEventListener('click', () => {
    $('.page').each((_, pageDiv) => pageDiv.querySelector('.annotationLayer').setTool('highlight'));
  });

  colorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    $('.page').each((_, pageDiv) => pageDiv.querySelector('.annotationLayer').setColor(color));
  });

  document.getElementById('saveAnnotations').addEventListener('click', () => {
    const saved = JSON.stringify(window.annotations || {});
    localStorage.setItem('pdfAnnotations', saved);
    setStatus('Annotations saved');
  });

  document.getElementById('loadAnnotations').addEventListener('click', () => {
    const loaded = localStorage.getItem('pdfAnnotations');
    if (loaded) {
      Object.values($('.page')).forEach(pageDiv => {
        const layer = pageDiv.querySelector('.annotationLayer');
        if (layer && layer.loadAnnotations) layer.loadAnnotations(loaded);
      });
      setStatus('Annotations loaded');
    }
  });

  const annotateBtn = document.getElementById('annotateBtn');
  let annotationsActive = false;

  annotateBtn.addEventListener('click', () => {
    annotationsActive = !annotationsActive;
    annotateBtn.textContent = annotationsActive ? 'Stop Annotating' : 'Annotate';
    setStatus(annotationsActive ? 'Annotation mode ON' : 'Annotation mode OFF');

    document.querySelectorAll('.annotationLayer').forEach(canvas => {
      canvas.style.pointerEvents = annotationsActive ? 'auto' : 'none';
    });
  });

  function addAnnotationLayer(pageDiv, pageNumber) {
    const canvas = document.createElement('canvas');
    canvas.className = 'annotationLayer';
    canvas.width = pageDiv.clientWidth;
    canvas.height = pageDiv.clientHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    pageDiv.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let startX = 0, startY = 0;
    let tool = 'freehand';
    let color = '#ff0000';
    let lineWidth = 2;

    if (!window.annotations) window.annotations = {};
    if (!window.annotations[pageNumber]) window.annotations[pageNumber] = [];

    function redrawAnnotations() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const annots = window.annotations[pageNumber];
      annots.forEach(a => {
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        ctx.lineWidth = a.lineWidth;
        if (a.type === 'freehand') {
          ctx.beginPath();
          ctx.moveTo(a.points[0].x, a.points[0].y);
          a.points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        } else if (a.type === 'highlight') {
          ctx.fillRect(a.x, a.y, a.width, a.height);
        }
      });
    }

    canvas.addEventListener('mousedown', (e) => {
      drawing = true;
      startX = e.offsetX;
      startY = e.offsetY;
      if (tool === 'freehand') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        window.currentPoints = [{ x: startX, y: startY }];
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      const x = e.offsetX;
      const y = e.offsetY;

      if (tool === 'freehand') {
        ctx.lineTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        window.currentPoints.push({ x, y });
      } else if (tool === 'highlight') {
        redrawAnnotations();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(startX, startY, x - startX, y - startY);
        ctx.globalAlpha = 1;
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      drawing = false;
      const x = e.offsetX;
      const y = e.offsetY;

      if (tool === 'freehand') {
        window.annotations[pageNumber].push({
          type: 'freehand',
          color,
          lineWidth,
          points: window.currentPoints
        });
        window.currentPoints = [];
      } else if (tool === 'highlight') {
        window.annotations[pageNumber].push({
          type: 'highlight',
          color,
          x: Math.min(startX, x),
          y: Math.min(startY, y),
          width: Math.abs(x - startX),
          height: Math.abs(y - startY)
        });
        redrawAnnotations();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      drawing = false;
      if (tool === 'freehand') window.currentPoints = [];
    });

    canvas.setTool = (newTool) => { tool = newTool; };
    canvas.setColor = (newColor) => { color = newColor; };
    canvas.saveAnnotations = () => { return JSON.stringify(window.annotations); };
    canvas.loadAnnotations = (json) => {
      window.annotations = JSON.parse(json);
      redrawAnnotations();
    };
  }

  // --- Load PDF ---
  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
      setStatus('Please select a PDF file first.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => loadPDF(e.target.result);
    reader.readAsArrayBuffer(file);
  });

  // --- Navigation ---
  prevBtn.addEventListener('click', () => flipbook.turn('previous'));
  nextBtn.addEventListener('click', () => flipbook.turn('next'));

  pageNumberInput.addEventListener('change', () => {
    const pageNum = parseInt(pageNumberInput.value);
    if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
      flipbook.turn('page', pageNum);
    } else {
      setStatus('Invalid page number.');
    }
  });

  // --- Zoom ---
  function applyTransform() {
    flipbook.css({
      transform: `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`,
      transformOrigin: 'center center',
      transition: 'transform 0.1s ease',
    });
    updateZoomBadge();
  }

  function resetPan() {
    translateX = 0;
    translateY = 0;
    applyTransform();
  }

  zoomInBtnEl.addEventListener('click', () => {
    if (currentZoom < maxZoom) {
      currentZoom += zoomStep;
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    }
  });

  zoomOutBtnEl.addEventListener('click', () => {
    if (currentZoom > minZoom) {
      currentZoom -= zoomStep;
      if (currentZoom <= 1) resetPan();
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    }
  });

  flipbookContainer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0 && currentZoom < maxZoom) currentZoom += zoomStep;
    else if (e.deltaY > 0 && currentZoom > minZoom) {
      currentZoom -= zoomStep;
      if (currentZoom <= 1) resetPan();
    }
    applyTransform();
    setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
  });

  flipbookContainer.addEventListener('mousedown', (e) => {
    if (currentZoom <= 1) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    flipbookContainer.style.cursor = 'grabbing';
  });

  flipbookContainer.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  });

  ['mouseup', 'mouseleave'].forEach(evt =>
    flipbookContainer.addEventListener(evt, () => {
      isDragging = false;
      flipbookContainer.style.cursor = 'default';
    })
  );

  // --- Sound ---
  toggleSoundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    toggleSoundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    toggleSoundBtn.title = soundEnabled ? 'Mute Sound' : 'Enable Sound';
    setStatus(soundEnabled ? 'Sound ON' : 'Sound OFF');
  });

  // --- Fit ---
  function fitToWidth() {
    const container = flipbookContainer.getBoundingClientRect();
    const book = flipbook[0].getBoundingClientRect();
    const newZoom = container.width / book.width;
    currentZoom = Math.min(maxZoom, newZoom);
    resetPan();
    applyTransform();
    setStatus('Fit to Width');
  }

  function fitToPage() {
    const container = flipbookContainer.getBoundingClientRect();
    const book = flipbook[0].getBoundingClientRect();
    const zoomX = container.width / book.width;
    const zoomY = container.height / book.height;
    const newZoom = Math.min(zoomX, zoomY);
    currentZoom = Math.min(maxZoom, newZoom);
    resetPan();
    applyTransform();
    setStatus('Fit to Page');
  }

  fitWidthBtn.addEventListener('click', fitToWidth);
  fitPageBtn.addEventListener('click', fitToPage);

  // --- Single / Double View ---
  toggleViewBtn.addEventListener('click', () => {
    isSinglePage = !isSinglePage;
    flipbook.turn('display', isSinglePage ? 'single' : 'double');
    setStatus(isSinglePage ? 'Single Page Mode' : 'Double Page Mode');
  });

  // --- Night Mode ---
  nightModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('night');
    const active = document.body.classList.contains('night');
    nightModeBtn.textContent = active ? '☀️' : '🌙';
    setStatus(active ? 'Night Mode ON' : 'Day Mode ON');
  });

  // --- Presentation Mode ---
  function updatePresentationPage(pageNum) {
    if (!pdfDoc) return;
    presentationPage.textContent = `Page ${pageNum} / ${pdfDoc.numPages}`;
    presentationProgress.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
  }

  function showPresentationUI() {
    presentationOverlay.classList.add('show-presentation-ui');
    clearTimeout(presentationHideTimer);
    presentationHideTimer = setTimeout(() => {
      presentationOverlay.classList.remove('show-presentation-ui');
    }, 4000);
  }

  function enterPresentationMode() {
    if (!pdfDoc) {
      setStatus('Load a PDF first.');
      return;
    }
    isPresentationMode = true;
    document.body.classList.add('presentation-active');
    presentationOverlay.classList.remove('hidden');

    const currentPage = flipbook.turn('page');
    updatePresentationPage(currentPage || 1);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    showPresentationUI();
    presentationBtn.textContent = 'Exit Present';
    setStatus('Presentation mode ON');
  }

  function exitPresentationMode() {
    isPresentationMode = false;
    document.body.classList.remove('presentation-active');
    presentationOverlay.classList.add('hidden');
    presentationOverlay.classList.remove('show-presentation-ui');
    clearTimeout(presentationHideTimer);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    presentationBtn.textContent = 'Present';
    setStatus('Presentation mode OFF');
  }

  presentationBtn.addEventListener('click', () => {
    if (isPresentationMode) {
      exitPresentationMode();
    } else {
      enterPresentationMode();
    }
  });

  presentationPrev.addEventListener('click', () => flipbook.turn('previous'));
  presentationNext.addEventListener('click', () => flipbook.turn('next'));
  presentationExit.addEventListener('click', exitPresentationMode);

  presentationOverlay.addEventListener('click', () => {
    if (presentationOverlay.classList.contains('show-presentation-ui')) {
      presentationOverlay.classList.remove('show-presentation-ui');
    } else {
      showPresentationUI();
    }
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (isPresentationMode) {
      if (e.key === 'Escape') {
        exitPresentationMode();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        flipbook.turn('next');
        showPresentationUI();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flipbook.turn('previous');
        showPresentationUI();
      }
      if (e.key === 'f') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }
      return;
    }

    if (e.target.tagName === 'INPUT') return;

    if (e.key === 'n') {
      nightModeBtn.click();
    }
  });

  // Exit presentation on ESC (fullscreen exit)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresentationMode) {
      exitPresentationMode();
    }
  });
});
