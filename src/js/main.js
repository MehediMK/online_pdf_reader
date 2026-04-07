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
  let visitedPages = [];

  // Detect touch device
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

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

  function resetState() {
    pdfDoc = null;
    currentPdfName = null;
    currentZoom = 1;
    translateX = 0;
    translateY = 0;
    visitedPages = [];
    pageNumberInput.value = '';
    totalPages.textContent = '';
    if (zoomLevel) zoomLevel.textContent = '100%';
    if (readBadge) readBadge.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    showEmptyState();
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

  function addVisitedPage(page) {
    if (!visitedPages.includes(page)) {
      visitedPages.push(page);
    }
    // Update thumbnail
    const thumb = thumbnailContainer.children[page - 1];
    if (thumb) thumb.classList.add('visited');
  }

  function updateReadPercent(current, total) {
    if (!total) return;
    const pct = Math.min(100, Math.floor((current / total) * 100));
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (readBadge) {
      readBadge.textContent = `${pct}%`;
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

      // Clean up previous instance
      if (pdfDoc) {
        flipbook.turn('destroy');
        flipbook.html('');
      }

      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages.textContent = `/ ${pdfDoc.numPages} pages`;
      pageNumberInput.max = pdfDoc.numPages;

      setStatus(`Rendering ${pdfDoc.numPages} pages...`);
      thumbnailContainer.innerHTML = '';
      outlineContainer.innerHTML = '';

      // Compute unique key for this PDF
      currentPdfName = fileInput.files[0]
        ? fileInput.files[0].name + '_' + fileInput.files[0].size
        : 'unknown_pdf';
      const progress = loadReadingProgress(currentPdfName);
      const hasSavedProgress = progress.lastPage > 1;

      // Setup resume prompt
      if (hasSavedProgress && resumePrompt) {
        resumePrompt.textContent = `Resume from page ${progress.lastPage}`;
        resumePrompt.style.display = 'flex';
        resumePrompt.onclick = () => {
          setTimeout(() => flipbook.turn('page', progress.lastPage), 500);
          resumePrompt.style.display = 'none';
        };
      } else if (resumePrompt) {
        resumePrompt.style.display = 'none';
      }

      // Mobile: force single page display
      isSinglePage = isTouchDevice;

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
        // Dynamic turn.js size based on screen
        const displayMode = isSinglePage ? 'single' : 'double';
        const vw = window.innerWidth;

        // For single-page mobile, each page = container width
        // For double, total book width = 2 * page width
        let bookWidth, bookHeight, pageWidth;

        if (isSinglePage) {
          bookWidth = vw <= 420 ? vw - 32 : vw <= 768 ? vw - 32 : Math.min(900, vw - 240);
          bookHeight = Math.min(600, window.innerHeight * 0.65);
        } else {
          bookWidth = 900;
          bookHeight = 600;
        }

        flipbook.turn({
          width: bookWidth,
          height: bookHeight,
          autoCenter: true,
          acceleration: true,
          display: displayMode,
          elevation: 50,
          gradients: true,
          duration: 800,
          first: hasSavedProgress ? progress.lastPage : 1,
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
              addVisitedPage(page);
              updateReadPercent(page, pdfDoc.numPages);
            }
          }
        });

        hideEmptyState();
        updateReadPercent(1, pdfDoc.numPages);
        addVisitedPage(1);

        setStatus(`Loaded ${pdfDoc.numPages} pages.`);
      }, 500);

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
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setTool('freehand');
    });
  });

  toolHighlightBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setTool('highlight');
    });
  });

  colorPicker.addEventListener('change', (e) => {
    if (!pdfDoc) return;
    const color = e.target.value;
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setColor(color);
    });
  });

  document.getElementById('saveAnnotations').addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const saved = JSON.stringify(window.annotations || {});
    localStorage.setItem('pdfAnnotations', saved);
    setStatus('Annotations saved');
  });

  document.getElementById('loadAnnotations').addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const loaded = localStorage.getItem('pdfAnnotations');
    if (loaded) {
      try {
        window.annotations = JSON.parse(loaded);
        document.querySelectorAll('.annotationLayer').forEach(canvas => {
          if (canvas.redrawAnnotations) canvas.redrawAnnotations();
        });
        setStatus('Annotations loaded');
      } catch {
        setStatus('Error loading annotations');
      }
    } else {
      setStatus('No saved annotations found');
    }
  });

  const annotateBtn = document.getElementById('annotateBtn');
  let annotationsActive = false;

  annotateBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    annotationsActive = !annotationsActive;
    annotateBtn.textContent = annotationsActive ? 'Stop' : 'Annotate';
    setStatus(annotationsActive ? 'Annotation mode ON' : 'Annotation mode OFF');

    document.querySelectorAll('.annotationLayer').forEach(canvas => {
      canvas.style.pointerEvents = annotationsActive ? 'auto' : 'none';
    });
  });

  function addAnnotationLayer(pageDiv, pageNumber) {
    const canvas = document.createElement('canvas');
    canvas.className = 'annotationLayer';
    canvas.width = pageDiv.clientWidth || 450;
    canvas.height = pageDiv.clientHeight || 600;
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

    // Expose for load
    canvas.redrawAnnotations = redrawAnnotations;

    canvas.addEventListener('mousedown', (e) => {
      if (!annotationsActive) return;
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
      if (!drawing || !annotationsActive) return;
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
      if (!annotationsActive) return;
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

  // --- Load PDF Button ---
  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
      setStatus('Please select a PDF file first.');
      return;
    }
    resetState();
    const reader = new FileReader();
    reader.onload = (e) => loadPDF(e.target.result);
    reader.readAsArrayBuffer(file);
  });

  // --- Navigation ---
  prevBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    flipbook.turn('previous');
  });

  nextBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    flipbook.turn('next');
  });

  pageNumberInput.addEventListener('change', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
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
    if (!pdfDoc) return;
    if (currentZoom < maxZoom) {
      currentZoom += zoomStep;
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    }
  });

  zoomOutBtnEl.addEventListener('click', () => {
    if (!pdfDoc) return;
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

  // --- Touch Events for Mobile Page Swiping ---
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoveX = 0;
  let isSwiping = false;

  flipbookContainer.addEventListener('touchstart', (e) => {
    // Don't intercept touch when in annotation mode
    if (annotationsActive) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMoveX = touchStartX;
    isSwiping = true;
  }, { passive: true });

  flipbookContainer.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    touchMoveX = touch.clientX;
  }, { passive: true });

  flipbookContainer.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;

    if (!pdfDoc) return;

    const diff = touchStartX - touchMoveX;
    const swipeThreshold = 50; // minimum swipe distance

    // Swipe left = go next, swipe right = go prev
    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        flipbook.turn('next');
      } else {
        flipbook.turn('previous');
      }
    }
  }, { passive: true });

  // --- Sound ---
  toggleSoundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    toggleSoundBtn.textContent = soundEnabled ? '🔊' : '🔇';
    setStatus(soundEnabled ? 'Sound ON' : 'Sound OFF');
  });

  // --- Fit to Width ---
  fitWidthBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    // Use actual Turn.js book dimensions, not transformed ones
    const book = flipbook.turn('size');
    const containerWidth = flipbookContainer.getBoundingClientRect().width;
    const newZoom = containerWidth / book.width;
    currentZoom = Math.min(maxZoom, newZoom);
    resetPan();
    applyTransform();
    setStatus('Fit to Width');
  });

  // --- Fit to Page ---
  fitPageBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const book = flipbook.turn('size');
    const containerWidth = flipbookContainer.getBoundingClientRect().width;
    const containerHeight = flipbookContainer.getBoundingClientRect().height;
    const zoomX = containerWidth / book.width;
    const zoomY = containerHeight / book.height;
    currentZoom = Math.min(maxZoom, Math.min(zoomX, zoomY));
    resetPan();
    applyTransform();
    setStatus('Fit Page');
  });

  // --- Single / Double View ---
  toggleViewBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    // On touch devices, keep single page always
    if (isTouchDevice) {
      setStatus('Single Page View (forced for mobile)');
      return;
    }
    isSinglePage = !isSinglePage;
    flipbook.turn('display', isSinglePage ? 'single' : 'double');
    setStatus(isSinglePage ? 'Single Page View' : 'Double Page View');
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
    presentationBtn.textContent = 'Exit';
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

  presentationBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPresentationMode) {
      exitPresentationMode();
    } else {
      enterPresentationMode();
    }
  });

  presentationPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    flipbook.turn('previous');
  });

  presentationNext.addEventListener('click', (e) => {
    e.stopPropagation();
    flipbook.turn('next');
  });

  presentationExit.addEventListener('click', (e) => {
    e.stopPropagation();
    exitPresentationMode();
  });

  presentationOverlay.addEventListener('click', (e) => {
    // Don't toggle UI if clicking a button or progress
    if (e.target.closest('.presentation-controls') ||
        e.target.closest('.presentation-progress') ||
        e.target.closest('.presentation-page')) return;

    if (presentationOverlay.classList.contains('show-presentation-ui')) {
      presentationOverlay.classList.remove('show-presentation-ui');
      clearTimeout(presentationHideTimer);
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
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        flipbook.turn('next');
        showPresentationUI();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
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

    if (e.key === 'ArrowRight' && pdfDoc) {
      flipbook.turn('next');
    }
    if (e.key === 'ArrowLeft' && pdfDoc) {
      flipbook.turn('previous');
    }
    if (e.key === 'n') {
      nightModeBtn.click();
    }
  });

  // Exit presentation on fullscreen exit
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresentationMode) {
      exitPresentationMode();
    }
  });

  // --- Mobile: handle orientation change ---
  window.addEventListener('resize', () => {
    if (!pdfDoc || !flipbook.turn('options')) return;

    const vw = window.innerWidth;
    let bookWidth, bookHeight;

    if (isSinglePage) {
      bookWidth = vw <= 420 ? vw - 24 : vw <= 768 ? vw - 20 : Math.min(900, vw - 200);
      bookHeight = Math.min(600, window.innerHeight * 0.65);
    } else {
      bookWidth = 900;
      bookHeight = 600;
    }

    flipbook.turn('size', bookWidth, bookHeight);

    // Resize annotation canvases
    flipbook.find('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) {
        layer.width = pageDiv.clientWidth;
        layer.height = pageDiv.clientHeight;
      }
    });
  });
});
