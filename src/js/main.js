window.addEventListener('load', () => {
  if (typeof pdfjsLib === 'undefined') {
    alert('PDF.js failed to load.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = './src/js/pdf.worker.min.js';

  // --- Elements ---
  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const emptyLoadBtn = document.getElementById('emptyLoadBtn');
  const status = document.getElementById('status');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const zoomInBtnEl = document.getElementById('zoomInBtn');
  const zoomOutBtnEl = document.getElementById('zoomOutBtn');
  const zoomLevel = document.getElementById('zoomLevel');
  const pageNumberInput = document.getElementById('pageNumberInput');
  const totalPages = document.getElementById('totalPages');
  const viewer = document.querySelector('.viewer');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const outlineContainer = document.getElementById('outlineContainer');
  const toggleSoundBtn = document.getElementById('toggleSoundBtn');
  const fitWidthBtn = document.getElementById('fitWidthBtn');
  const fitPageBtn = document.getElementById('fitPageBtn');
  const toggleViewBtn = document.getElementById('toggleViewBtn');
  const nightModeBtn = document.getElementById('nightModeBtn');
  const printBtn = document.getElementById('printBtn');
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
  const annotateBtn = document.getElementById('annotateBtn');
  const toolFreehandBtn = document.getElementById('toolFreehand');
  const toolHighlightBtn = document.getElementById('toolHighlight');
  const colorPicker = document.getElementById('colorPicker');
  const saveAnnotationsBtn = document.getElementById('saveAnnotations');
  const loadAnnotationsBtn = document.getElementById('loadAnnotations');

  // --- State ---
  let pdfDoc = null;
  let currentPdfName = null;
  let currentZoom = 1;
  const minZoom = 0.5;
  const maxZoom = 2.5;
  const zoomStep = 0.1;
  let isDragging = false, dragStartX = 0, dragStartY = 0, translateX = 0, translateY = 0;
  let isSinglePage = false;
  let soundEnabled = true;
  let isPresentationMode = false;
  let presentationHideTimer = null;
  let visitedPages = [];
  let annotationsActive = false;
  let isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // --- Utility ---
  function setStatus(msg) {
    status.textContent = msg;
  }

  function updateZoomBadge() {
    if (zoomLevel) zoomLevel.textContent = `${(currentZoom * 100).toFixed(0)}%`;
  }

  function showEmptyState() {
    if (emptyState) emptyState.classList.remove('hidden');
  }

  function hideEmptyState() {
    if (emptyState) emptyState.classList.add('hidden');
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
    flipbook.html('');
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
    } catch { return { lastPage: 1, visited: [] }; }
  }

  function saveReadingProgress(name, pageNum) {
    try {
      const progress = loadReadingProgress(name);
      if (!progress.visited.includes(pageNum)) progress.visited.push(pageNum);
      if (pageNum > progress.lastPage) progress.lastPage = pageNum;
      localStorage.setItem(pdfKey(name), JSON.stringify(progress));
    } catch {}
  }

  function addVisitedPage(page) {
    if (!visitedPages.includes(page)) visitedPages.push(page);
    const thumb = thumbnailContainer.children[page - 1];
    if (thumb) thumb.classList.add('visited');
  }

  function updateReadPercent(current, total) {
    if (!total) return;
    const pct = Math.min(100, Math.floor((current / total) * 100));
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (readBadge) { readBadge.textContent = `${pct}%`; readBadge.style.display = ''; }
  }

  // --- Sidebar Toggle ---
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
    backdrop.classList.toggle('active', sidebarOpen);
    backdrop.onclick = () => {
      sidebarOpen = false;
      sidebar.classList.remove('sidebar-open');
      backdrop.classList.remove('active');
    };
  });

  // --- PDF Loading via Browse ---
  function loadFile(file) {
    if (!file || file.type !== 'application/pdf') {
      setStatus('Please select a valid PDF file.');
      return;
    }
    resetState();
    const reader = new FileReader();
    reader.onload = (e) => loadPDF(e.target.result);
    reader.readAsArrayBuffer(file);
  }

  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { setStatus('Please select a PDF file first.'); return; }
    loadFile(file);
  });

  if (emptyLoadBtn) {
    emptyLoadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  emptyState.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  // --- Drag & Drop ---
  let dragCounter = 0;

  function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    document.addEventListener(evt, preventDefaults, false);
  });

  document.addEventListener('dragenter', (e) => {
    dragCounter++;
    viewer.classList.add('drag-over');
    if (emptyState) emptyState.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      viewer.classList.remove('drag-over');
      if (emptyState) emptyState.classList.remove('drag-over');
    }
  });

  document.addEventListener('drop', (e) => {
    dragCounter = 0;
    viewer.classList.remove('drag-over');
    if (emptyState) emptyState.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      loadFile(files[0]);
      fileInput.files = files;
    } else {
      setStatus('Please drop a valid PDF file.');
    }
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

      if (pdfDoc) {
        flipbook.turn('destroy');
        flipbook.html('');
      }

      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages.textContent = `/ ${pdfDoc.numPages}`;
      pageNumberInput.max = pdfDoc.numPages;

      setStatus(`Rendering ${pdfDoc.numPages} pages...`);
      thumbnailContainer.innerHTML = '';
      outlineContainer.innerHTML = '';

      currentPdfName = fileInput.files[0]
        ? fileInput.files[0].name + '_' + fileInput.files[0].size
        : 'unknown_pdf';
      const progress = loadReadingProgress(currentPdfName);
      const hasSavedProgress = progress.lastPage > 1;

      if (hasSavedProgress && resumePrompt) {
        resumePrompt.style.display = 'flex';
        resumePrompt.querySelector('button').textContent = `Resume from page ${progress.lastPage}`;
        resumePrompt.onclick = () => {
          setTimeout(() => flipbook.turn('page', progress.lastPage), 500);
          resumePrompt.style.display = 'none';
        };
      } else if (resumePrompt) {
        resumePrompt.style.display = 'none';
      }

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
        const displayMode = isSinglePage ? 'single' : 'double';
        const vw = window.innerWidth;
        let bookWidth, bookHeight;

        if (isSinglePage) {
          bookWidth = vw <= 420 ? vw - 24 : vw <= 768 ? vw - 20 : Math.min(900, vw - 280);
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
              if (soundEnabled) {
                const flipSound = document.getElementById('flipSound');
                flipSound.currentTime = 0;
                flipSound.play().catch(() => {});
              }
              if (isPresentationMode) updatePresentationPage(page);
            },
            turned: function (event, page, view) {
              pageNumberInput.value = page;
              if (currentPdfName) saveReadingProgress(currentPdfName, page);
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
  function addAnnotationLayer(pageDiv, pageNumber) {
    const canvas = document.createElement('canvas');
    canvas.className = 'annotationLayer';
    canvas.width = pageDiv.clientWidth || 450;
    canvas.height = pageDiv.clientHeight || 600;
    pageDiv.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let startX = 0, startY = 0;
    let tool = 'freehand';
    let color = '#6366f1';
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

    canvas.redrawAnnotations = redrawAnnotations;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const touch = e.touches ? e.touches[0] : e;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    }

    function onPointerDown(e) {
      if (!annotationsActive) return;
      drawing = true;
      const pos = getPos(e);
      startX = pos.x;
      startY = pos.y;
      if (tool === 'freehand') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        window.currentPoints = [{ x: startX, y: startY }];
      }
    }

    function onPointerMove(e) {
      if (!drawing || !annotationsActive) return;
      e.preventDefault();
      const pos = getPos(e);
      const x = pos.x, y = pos.y;

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
    }

    function onPointerUp(e) {
      if (!annotationsActive) return;
      drawing = false;
      const pos = getPos(e);
      const x = pos.x, y = pos.y;

      if (tool === 'freehand') {
        window.annotations[pageNumber].push({
          type: 'freehand', color, lineWidth,
          points: window.currentPoints || []
        });
        window.currentPoints = [];
      } else if (tool === 'highlight') {
        window.annotations[pageNumber].push({
          type: 'highlight', color,
          x: Math.min(startX, x), y: Math.min(startY, y),
          width: Math.abs(x - startX), height: Math.abs(y - startY)
        });
        redrawAnnotations();
      }
    }

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', () => {
      drawing = false;
      if (tool === 'freehand') window.currentPoints = [];
    });

    canvas.addEventListener('touchstart', (e) => { onPointerDown(e); }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { onPointerMove(e); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { onPointerUp(e); }, { passive: true });

    canvas.setTool = (newTool) => { tool = newTool; };
    canvas.setColor = (newColor) => { color = newColor; };
  }

  // Annotation controls
  toolFreehandBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setTool('freehand');
    });
    setStatus('Freehand tool selected');
  });

  toolHighlightBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setTool('highlight');
    });
    setStatus('Highlight tool selected');
  });

  colorPicker.addEventListener('change', (e) => {
    if (!pdfDoc) return;
    const color = e.target.value;
    $('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) layer.setColor(color);
    });
  });

  saveAnnotationsBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const saved = JSON.stringify(window.annotations || {});
    localStorage.setItem('pdfAnnotations', saved);
    setStatus('Annotations saved');
  });

  loadAnnotationsBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const loaded = localStorage.getItem('pdfAnnotations');
    if (loaded) {
      try {
        window.annotations = JSON.parse(loaded);
        document.querySelectorAll('.annotationLayer').forEach(canvas => {
          if (canvas.redrawAnnotations) canvas.redrawAnnotations();
        });
        setStatus('Annotations loaded');
      } catch { setStatus('Error loading annotations'); }
    } else { setStatus('No saved annotations found'); }
  });

  annotateBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    annotationsActive = !annotationsActive;
    annotateBtn.classList.toggle('active', annotationsActive);
    setStatus(annotationsActive ? 'Annotation mode ON' : 'Annotation mode OFF');
    document.querySelectorAll('.annotationLayer').forEach(canvas => {
      canvas.classList.toggle('active', annotationsActive);
    });
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
    } else { setStatus('Invalid page number.'); }
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
    if (currentZoom < maxZoom) { currentZoom += zoomStep; applyTransform(); setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`); }
  });

  zoomOutBtnEl.addEventListener('click', () => {
    if (!pdfDoc) return;
    if (currentZoom > minZoom) { currentZoom -= zoomStep; if (currentZoom <= 1) resetPan(); applyTransform(); setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`); }
  });

  viewer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0 && currentZoom < maxZoom) currentZoom += zoomStep;
    else if (e.deltaY > 0 && currentZoom > minZoom) { currentZoom -= zoomStep; if (currentZoom <= 1) resetPan(); }
    applyTransform();
    setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
  }, { passive: false });

  viewer.addEventListener('mousedown', (e) => {
    if (currentZoom <= 1) return;
    isDragging = true;
    dragStartX = e.clientX - translateX;
    dragStartY = e.clientY - translateY;
    viewer.style.cursor = 'grabbing';
  });

  viewer.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - dragStartX;
    translateY = e.clientY - dragStartY;
    applyTransform();
  });

  ['mouseup', 'mouseleave'].forEach(evt =>
    viewer.addEventListener(evt, () => { isDragging = false; viewer.style.cursor = ''; })
  );

  // --- Touch Swipe ---
  let touchStartX = 0, touchStartY = 0, touchMoveX = 0, isSwiping = false;

  viewer.addEventListener('touchstart', (e) => {
    if (annotationsActive) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchMoveX = touchStartX;
    isSwiping = true;
  }, { passive: true });

  viewer.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    touchMoveX = e.touches[0].clientX;
  }, { passive: true });

  viewer.addEventListener('touchend', () => {
    if (!isSwiping || !pdfDoc) return;
    isSwiping = false;
    const diff = touchStartX - touchMoveX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? flipbook.turn('next') : flipbook.turn('previous');
    }
  }, { passive: true });

  // --- Sound ---
  toggleSoundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    toggleSoundBtn.classList.toggle('muted', !soundEnabled);
    setStatus(soundEnabled ? 'Sound ON' : 'Sound OFF');
  });

  // --- Fit to Width ---
  fitWidthBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const book = flipbook.turn('size');
    const containerWidth = viewer.getBoundingClientRect().width;
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
    const rect = viewer.getBoundingClientRect();
    const zoomX = rect.width / book.width;
    const zoomY = rect.height / book.height;
    currentZoom = Math.min(maxZoom, Math.min(zoomX, zoomY));
    resetPan();
    applyTransform();
    setStatus('Fit Page');
  });

  // --- View Toggle ---
  toggleViewBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    if (isTouchDevice) { setStatus('Single Page View'); return; }
    isSinglePage = !isSinglePage;
    flipbook.turn('display', isSinglePage ? 'single' : 'double');
    setStatus(isSinglePage ? 'Single Page' : 'Double Page');
  });

  // --- Night Mode ---
  nightModeBtn.addEventListener('click', () => {
    document.body.classList.toggle('night');
    setStatus(document.body.classList.contains('night') ? 'Night Mode ON' : 'Day Mode ON');
  });

  // --- Print ---
  printBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    window.print();
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
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    isPresentationMode = true;
    document.body.classList.add('presentation-active');
    presentationOverlay.classList.remove('hidden');
    const currentPage = flipbook.turn('page');
    updatePresentationPage(currentPage || 1);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    showPresentationUI();
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
    setStatus('Presentation mode OFF');
  }

  presentationBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isPresentationMode ? exitPresentationMode() : enterPresentationMode();
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
    if (e.target.closest('.presentation-bar') || e.target.closest('.presentation-page-info')) return;
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
      if (e.key === 'Escape') { exitPresentationMode(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); flipbook.turn('next'); showPresentationUI();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); flipbook.turn('previous'); showPresentationUI();
      }
      if (e.key === 'f') {
        if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
        else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(() => {}); }
      }
      return;
    }

    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' && pdfDoc) flipbook.turn('next');
    if (e.key === 'ArrowLeft' && pdfDoc) flipbook.turn('previous');
    if (e.key === 'n') nightModeBtn.click();
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPresentationMode) exitPresentationMode();
  });

  // --- Resize ---
  window.addEventListener('resize', () => {
    if (!pdfDoc || !flipbook.turn('options')) return;
    const vw = window.innerWidth;
    let bookWidth, bookHeight;
    if (isSinglePage) {
      bookWidth = vw <= 420 ? vw - 24 : vw <= 768 ? vw - 20 : Math.min(900, vw - 280);
      bookHeight = Math.min(600, window.innerHeight * 0.65);
    } else {
      bookWidth = 900;
      bookHeight = 600;
    }
    flipbook.turn('size', bookWidth, bookHeight);
    flipbook.find('.page').each((_, pageDiv) => {
      const layer = pageDiv.querySelector('.annotationLayer');
      if (layer) { layer.width = pageDiv.clientWidth; layer.height = pageDiv.clientHeight; }
    });
  });

  // Initial status
  setStatus('No file selected');
});