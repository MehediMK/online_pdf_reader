window.addEventListener('load', () => {
  if (typeof pdfjsLib === 'undefined') { alert('PDF.js failed to load.'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = './src/js/pdf.worker.min.js';

  // --- Elements ---
  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const emptyLoadBtn = document.getElementById('emptyLoadBtn');
  const status = document.getElementById('status');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const firstPageBtn = document.getElementById('firstPageBtn');
  const lastPageBtn = document.getElementById('lastPageBtn');
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
  const gotoBtn = document.getElementById('gotoBtn');
  const gotoModal = document.getElementById('gotoModal');
  const gotoInput = document.getElementById('gotoInput');
  const gotoCancelBtn = document.getElementById('gotoCancelBtn');
  const gotoConfirmBtn = document.getElementById('gotoConfirmBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const searchInput = document.getElementById('searchInput');
  const searchPrevBtn = document.getElementById('searchPrevBtn');
  const searchNextBtn = document.getElementById('searchNextBtn');
  const searchCount = document.getElementById('searchCount');
  const bookmarkContainer = document.getElementById('bookmarkContainer');
  const recentContainer = document.getElementById('recentContainer');
  const immersiveBtn = document.getElementById('immersiveBtn');

  const flipbook = $('#flipbook');
  const annotateBtn = document.getElementById('annotateBtn');
  const toolFreehandBtn = document.getElementById('toolFreehand');
  const toolHighlightBtn = document.getElementById('toolHighlight');
  const colorPicker = document.getElementById('colorPicker');
  const saveAnnotationsBtn = document.getElementById('saveAnnotations');
  const loadAnnotationsBtn = document.getElementById('loadAnnotations');

  // --- State ---
  let pdfDoc = null;
  let pdfData = null;
  let pdfFileName = null;
  let currentPdfName = null;
  let currentZoom = 1;
  const minZoom = 0.5, maxZoom = 2.5, zoomStep = 0.1;
  let isDragging = false, dragStartX = 0, dragStartY = 0, translateX = 0, translateY = 0;
  let isSinglePage = false;
  let soundEnabled = true;
  let isPresentationMode = false;
  let presentationHideTimer = null;
  let visitedPages = [];
  let annotationsActive = false;
  let isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  let searchResults = [];
  let searchIndex = -1;

  // --- Utility ---
  function setStatus(msg) { status.textContent = msg; }
  function updateZoomBadge() { if (zoomLevel) zoomLevel.textContent = `${(currentZoom * 100).toFixed(0)}%`; }
  function showEmptyState() { if (emptyState) emptyState.classList.remove('hidden'); }
  function hideEmptyState() { if (emptyState) emptyState.classList.add('hidden'); }

  function resetState() {
    pdfDoc = null; pdfData = null; pdfFileName = null; currentPdfName = null;
    currentZoom = 1; translateX = 0; translateY = 0; visitedPages = [];
    pageNumberInput.value = ''; totalPages.textContent = '';
    if (zoomLevel) zoomLevel.textContent = '100%';
    if (readBadge) readBadge.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    searchResults = []; searchIndex = -1; updateSearchUI();
    showEmptyState(); flipbook.html(''); updateBookmarkUI(); updateRecentUI();
  }

  // --- Reading Progress ---
  function pdfKey(name) { return `pdf_progress_${name}`; }

  function loadReadingProgress(name) {
    try { const d = localStorage.getItem(pdfKey(name)); return d ? JSON.parse(d) : { lastPage: 1, visited: [] }; }
    catch { return { lastPage: 1, visited: [] }; }
  }

  function saveReadingProgress(name, pageNum) {
    try {
      const p = loadReadingProgress(name);
      if (!p.visited.includes(pageNum)) p.visited.push(pageNum);
      if (pageNum > p.lastPage) p.lastPage = pageNum;
      localStorage.setItem(pdfKey(name), JSON.stringify(p));
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

  // --- Recent Files ---
  function getRecentFiles() {
    try { return JSON.parse(localStorage.getItem('pdf_recent') || '[]'); } catch { return []; }
  }

  function addRecentFile(name, size) {
    const recent = getRecentFiles().filter(f => f.name !== name);
    recent.unshift({ name, size, time: Date.now() });
    if (recent.length > 10) recent.length = 10;
    localStorage.setItem('pdf_recent', JSON.stringify(recent));
    updateRecentUI();
  }

  function updateRecentUI() {
    if (!recentContainer) return;
    const recent = getRecentFiles();
    if (recent.length === 0) {
      recentContainer.innerHTML = '<p class="sidebar-empty">No recent files</p>';
      return;
    }
    recentContainer.innerHTML = recent.map(f => `
      <div class="recent-item" data-name="${f.name}" data-size="${f.size}">
        <span class="recent-icon">📄</span>
        <span class="recent-name" title="${f.name}">${f.name}</span>
      </div>
    `).join('');
    recentContainer.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.name;
        const size = parseInt(el.dataset.size);
        loadRecentFile(name, size);
      });
    });
  }

  async function loadRecentFile(name, size) {
    const recent = getRecentFiles();
    const found = recent.find(f => f.name === name && f.size === size);
    if (!found) { setStatus('File not found in recent.'); return; }
    setStatus(`Opening ${name}...`);
    const stored = localStorage.getItem(`pdf_data_${name}_${size}`);
    if (stored) {
      try {
        const binary = atob(stored);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        pdfFileName = name;
        await loadPDF(bytes.buffer, name, size);
      } catch { setStatus('Failed to load recent file.'); }
    } else { setStatus('Recent file data unavailable.'); }
  }

  // --- Bookmarks ---
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('pdf_bookmarks') || '[]'); } catch { return []; }
  }

  function saveBookmarks(bookmarks) {
    localStorage.setItem('pdf_bookmarks', JSON.stringify(bookmarks));
    updateBookmarkUI();
  }

  function addBookmark(page, title) {
    const bookmarks = getBookmarks();
    if (bookmarks.some(b => b.page === page && b.pdf === currentPdfName)) return;
    bookmarks.push({ pdf: currentPdfName, page, title: title || `Page ${page}`, time: Date.now() });
    saveBookmarks(bookmarks);
    setStatus(`Bookmarked page ${page}`);
  }

  function removeBookmark(index) {
    const bookmarks = getBookmarks();
    bookmarks.splice(index, 1);
    saveBookmarks(bookmarks);
    setStatus('Bookmark removed');
  }

  function updateBookmarkUI() {
    if (!bookmarkContainer) return;
    const bookmarks = currentPdfName ? getBookmarks().filter(b => b.pdf === currentPdfName) : [];
    if (bookmarks.length === 0) {
      bookmarkContainer.innerHTML = '<p class="sidebar-empty">No bookmarks yet</p>';
      return;
    }
    bookmarkContainer.innerHTML = bookmarks.map((b, i) => `
      <div class="bookmark-item" data-index="${i}">
        <span class="bookmark-page">${b.page}</span>
        <span class="bookmark-title">${b.title}</span>
        <button class="bookmark-remove" data-index="${i}" title="Remove bookmark">&times;</button>
      </div>
    `).join('');
    bookmarkContainer.querySelectorAll('.bookmark-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-remove')) return;
        const idx = parseInt(el.dataset.index);
        const bookmarks = getBookmarks().filter(b => b.pdf === currentPdfName);
        if (bookmarks[idx]) flipbook.turn('page', bookmarks[idx].page);
      });
    });
    bookmarkContainer.querySelectorAll('.bookmark-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeBookmark(parseInt(btn.dataset.index));
      });
    });
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
    backdrop.onclick = () => { sidebarOpen = false; sidebar.classList.remove('sidebar-open'); backdrop.classList.remove('active'); };
  });

  // --- PDF Loading ---
  function loadFile(file) {
    if (!file || file.type !== 'application/pdf') { setStatus('Please select a valid PDF file.'); return; }
    resetState();
    pdfFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      pdfData = e.target.result;
      loadPDF(pdfData, file.name, file.size);
    };
    reader.readAsArrayBuffer(file);
  }

  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { setStatus('Please select a PDF file first.'); return; }
    loadFile(file);
  });

  if (emptyLoadBtn) {
    emptyLoadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  }
  emptyState.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

  // --- Drag & Drop ---
  let dragCounter = 0;
  function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => document.addEventListener(evt, preventDefaults, false));
  document.addEventListener('dragenter', () => { dragCounter++; viewer.classList.add('drag-over'); if (emptyState) emptyState.classList.add('drag-over'); });
  document.addEventListener('dragleave', () => { dragCounter--; if (dragCounter === 0) { viewer.classList.remove('drag-over'); if (emptyState) emptyState.classList.remove('drag-over'); } });
  document.addEventListener('drop', (e) => {
    dragCounter = 0; viewer.classList.remove('drag-over'); if (emptyState) emptyState.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') { loadFile(files[0]); fileInput.files = files; }
    else { setStatus('Please drop a valid PDF file.'); }
  });

  // --- PDF Rendering ---
  async function renderPage(pdf, pageNumber, scale = 1.5) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = document.createElement('img'); img.src = canvas.toDataURL('image/jpeg', 0.9);
    return img;
  }

  async function loadPDF(arrayBuffer, fileName, fileSize) {
    try {
      setStatus('Loading PDF...');
      if (pdfDoc) { flipbook.turn('destroy'); flipbook.html(''); }

      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages.textContent = `/ ${pdfDoc.numPages}`;
      pageNumberInput.max = pdfDoc.numPages;

      setStatus(`Rendering ${pdfDoc.numPages} pages...`);
      thumbnailContainer.innerHTML = '';
      outlineContainer.innerHTML = '';

      currentPdfName = fileName ? `${fileName}_${fileSize}` : 'unknown_pdf';

      // Save PDF data for recent files
      if (fileName && fileSize) {
        try {
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          localStorage.setItem(`pdf_data_${fileName}_${fileSize}`, btoa(binary));
          addRecentFile(fileName, fileSize);
        } catch {}
      }

      const progress = loadReadingProgress(currentPdfName);
      const hasSavedProgress = progress.lastPage > 1;

      if (hasSavedProgress && resumePrompt) {
        resumePrompt.style.display = 'flex';
        resumePrompt.querySelector('button').textContent = `Resume from page ${progress.lastPage}`;
        resumePrompt.onclick = () => { setTimeout(() => flipbook.turn('page', progress.lastPage), 500); resumePrompt.style.display = 'none'; };
      } else if (resumePrompt) resumePrompt.style.display = 'none';

      isSinglePage = isTouchDevice;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageImg = await renderPage(pdfDoc, i);
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.appendChild(pageImg);

        const overlay = document.createElement('span');
        overlay.className = 'page-number-overlay';
        overlay.textContent = `- ${i} -`;
        pageDiv.appendChild(overlay);

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
        } else { bookWidth = 900; bookHeight = 600; }

        flipbook.turn({
          width: bookWidth, height: bookHeight, autoCenter: true, acceleration: true,
          display: displayMode, elevation: 50, gradients: true, duration: 800,
          first: hasSavedProgress ? progress.lastPage : 1,
          when: {
            turning: function (event, page, view) {
              if (soundEnabled) { const fs = document.getElementById('flipSound'); fs.currentTime = 0; fs.play().catch(() => {}); }
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
        updateBookmarkUI();
        setStatus(`Loaded ${pdfDoc.numPages} pages.`);
      }, 500);
    } catch (err) { console.error(err); setStatus('Failed to load PDF.'); }
  }

  // --- Search ---
  let searchTimeout = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(searchInput.value.trim()), 300);
  });

  searchPrevBtn.addEventListener('click', () => { if (searchResults.length) { searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length; goToSearchResult(); } });
  searchNextBtn.addEventListener('click', () => { if (searchResults.length) { searchIndex = (searchIndex + 1) % searchResults.length; goToSearchResult(); } });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) searchPrevBtn.click();
      else searchNextBtn.click();
    }
    if (e.key === 'Escape') { searchInput.value = ''; searchResults = []; searchIndex = -1; updateSearchUI(); searchInput.blur(); }
  });

  async function performSearch(query) {
    searchResults = []; searchIndex = -1;
    if (!query || !pdfDoc) { updateSearchUI(); return; }

    const lower = query.toLowerCase();
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        if (text.toLowerCase().includes(lower)) {
          searchResults.push({ page: i, text: text.substring(0, 80) });
        }
      } catch {}
    }
    if (searchResults.length > 0) { searchIndex = 0; goToSearchResult(); }
    updateSearchUI();
    setStatus(searchResults.length ? `Found ${searchResults.length} results` : 'No results found');
  }

  function goToSearchResult() {
    if (searchResults[searchIndex]) {
      flipbook.turn('page', searchResults[searchIndex].page);
    }
  }

  function updateSearchUI() {
    if (!searchCount) return;
    if (searchResults.length > 0) searchCount.textContent = `${searchIndex + 1}/${searchResults.length}`;
    else searchCount.textContent = '';
  }

  // --- Go to Page Modal ---
  gotoBtn.addEventListener('click', () => openGotoModal());

  function openGotoModal() {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    gotoModal.classList.remove('hidden');
    gotoInput.value = flipbook.turn('page') || 1;
    gotoInput.focus();
    gotoInput.select();
  }

  function closeGotoModal() { gotoModal.classList.add('hidden'); }

  function confirmGoto() {
    const page = parseInt(gotoInput.value);
    if (page >= 1 && page <= pdfDoc.numPages) { flipbook.turn('page', page); closeGotoModal(); }
    else setStatus('Invalid page number.');
  }

  gotoCancelBtn.addEventListener('click', closeGotoModal);
  gotoConfirmBtn.addEventListener('click', confirmGoto);
  gotoModal.addEventListener('click', (e) => { if (e.target === gotoModal) closeGotoModal(); });
  gotoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmGoto(); if (e.key === 'Escape') closeGotoModal(); });

  // --- Download PDF ---
  downloadBtn.addEventListener('click', () => {
    if (!pdfData) { setStatus('No PDF loaded.'); return; }
    const blob = new Blob([pdfData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = pdfFileName || 'document.pdf';
    a.click(); URL.revokeObjectURL(url);
    setStatus('PDF downloaded');
  });

  // --- First / Last Page ---
  firstPageBtn.addEventListener('click', () => { if (pdfDoc) flipbook.turn('page', 1); else setStatus('Load a PDF first.'); });
  lastPageBtn.addEventListener('click', () => { if (pdfDoc) flipbook.turn('page', pdfDoc.numPages); else setStatus('Load a PDF first.'); });

  // --- Add Bookmark ---
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'b' && !e.ctrlKey && !e.metaKey && pdfDoc) {
      const page = flipbook.turn('page');
      if (getBookmarks().filter(b => b.pdf === currentPdfName).some(b => b.page === page)) {
        setStatus('Page already bookmarked');
      } else {
        addBookmark(page, `Page ${page}`);
      }
    }
  });

  // --- Annotation Layer ---
  function addAnnotationLayer(pageDiv, pageNumber) {
    const canvas = document.createElement('canvas');
    canvas.className = 'annotationLayer';
    canvas.width = pageDiv.clientWidth || 450;
    canvas.height = pageDiv.clientHeight || 600;
    pageDiv.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let drawing = false, startX = 0, startY = 0, tool = 'freehand', color = '#6366f1', lineWidth = 2;
    if (!window.annotations) window.annotations = {};
    if (!window.annotations[pageNumber]) window.annotations[pageNumber] = [];

    function redrawAnnotations() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      (window.annotations[pageNumber] || []).forEach(a => {
        ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.lineWidth;
        if (a.type === 'freehand') { ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y); a.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); }
        else if (a.type === 'highlight') { ctx.fillRect(a.x, a.y, a.width, a.height); }
      });
    }
    canvas.redrawAnnotations = redrawAnnotations;

    function getPos(e) {
      const r = canvas.getBoundingClientRect(), sX = canvas.width / r.width, sY = canvas.height / r.height;
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * sX, y: (t.clientY - r.top) * sY };
    }
    function onPointerDown(e) {
      if (!annotationsActive) return; drawing = true; const p = getPos(e); startX = p.x; startY = p.y;
      if (tool === 'freehand') { ctx.beginPath(); ctx.moveTo(startX, startY); window.currentPoints = [{ x: startX, y: startY }]; }
    }
    function onPointerMove(e) {
      if (!drawing || !annotationsActive) return; e.preventDefault(); const p = getPos(e), x = p.x, y = p.y;
      if (tool === 'freehand') { ctx.lineTo(x, y); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke(); window.currentPoints.push({ x, y }); }
      else if (tool === 'highlight') { redrawAnnotations(); ctx.fillStyle = color; ctx.globalAlpha = 0.3; ctx.fillRect(startX, startY, x - startX, y - startY); ctx.globalAlpha = 1; }
    }
    function onPointerUp(e) {
      if (!annotationsActive) return; drawing = false; const p = getPos(e), x = p.x, y = p.y;
      if (tool === 'freehand') { window.annotations[pageNumber].push({ type: 'freehand', color, lineWidth, points: window.currentPoints || [] }); window.currentPoints = []; }
      else if (tool === 'highlight') { window.annotations[pageNumber].push({ type: 'highlight', color, x: Math.min(startX, x), y: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY) }); redrawAnnotations(); }
    }
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', () => { drawing = false; if (tool === 'freehand') window.currentPoints = []; });
    canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp, { passive: true });
    canvas.setTool = (t) => { tool = t; };
    canvas.setColor = (c) => { color = c; };
  }

  toolFreehandBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, d) => { const l = d.querySelector('.annotationLayer'); if (l) l.setTool('freehand'); });
    setStatus('Freehand tool');
  });
  toolHighlightBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    $('.page').each((_, d) => { const l = d.querySelector('.annotationLayer'); if (l) l.setTool('highlight'); });
    setStatus('Highlight tool');
  });
  colorPicker.addEventListener('change', (e) => {
    if (!pdfDoc) return; const c = e.target.value;
    $('.page').each((_, d) => { const l = d.querySelector('.annotationLayer'); if (l) l.setColor(c); });
  });
  saveAnnotationsBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    localStorage.setItem('pdfAnnotations', JSON.stringify(window.annotations || {}));
    setStatus('Annotations saved');
  });
  loadAnnotationsBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const loaded = localStorage.getItem('pdfAnnotations');
    if (loaded) { try { window.annotations = JSON.parse(loaded); document.querySelectorAll('.annotationLayer').forEach(c => { if (c.redrawAnnotations) c.redrawAnnotations(); }); setStatus('Annotations loaded'); } catch { setStatus('Error loading annotations'); } }
    else setStatus('No saved annotations');
  });
  annotateBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    annotationsActive = !annotationsActive;
    annotateBtn.classList.toggle('active', annotationsActive);
    setStatus(annotationsActive ? 'Annotation ON' : 'Annotation OFF');
    document.querySelectorAll('.annotationLayer').forEach(c => c.classList.toggle('active', annotationsActive));
  });

  // --- Navigation ---
  prevBtn.addEventListener('click', () => { if (!pdfDoc) { setStatus('Load a PDF first.'); return; } flipbook.turn('previous'); });
  nextBtn.addEventListener('click', () => { if (!pdfDoc) { setStatus('Load a PDF first.'); return; } flipbook.turn('next'); });
  pageNumberInput.addEventListener('change', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const p = parseInt(pageNumberInput.value);
    if (p >= 1 && p <= pdfDoc.numPages) flipbook.turn('page', p); else setStatus('Invalid page.');
  });

  // --- Zoom ---
  function applyTransform() {
    flipbook.css({ transform: `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`, transformOrigin: 'center center', transition: 'transform 0.1s ease' });
    updateZoomBadge();
  }
  function resetPan() { translateX = 0; translateY = 0; applyTransform(); }
  zoomInBtnEl.addEventListener('click', () => { if (!pdfDoc) return; if (currentZoom < maxZoom) { currentZoom += zoomStep; applyTransform(); setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`); } });
  zoomOutBtnEl.addEventListener('click', () => { if (!pdfDoc) return; if (currentZoom > minZoom) { currentZoom -= zoomStep; if (currentZoom <= 1) resetPan(); applyTransform(); setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`); } });
  viewer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; e.preventDefault();
    if (e.deltaY < 0 && currentZoom < maxZoom) currentZoom += zoomStep;
    else if (e.deltaY > 0 && currentZoom > minZoom) { currentZoom -= zoomStep; if (currentZoom <= 1) resetPan(); }
    applyTransform(); setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
  }, { passive: false });
  viewer.addEventListener('mousedown', (e) => { if (currentZoom <= 1) return; isDragging = true; dragStartX = e.clientX - translateX; dragStartY = e.clientY - translateY; viewer.style.cursor = 'grabbing'; });
  viewer.addEventListener('mousemove', (e) => { if (!isDragging) return; translateX = e.clientX - dragStartX; translateY = e.clientY - dragStartY; applyTransform(); });
  ['mouseup', 'mouseleave'].forEach(evt => viewer.addEventListener(evt, () => { isDragging = false; viewer.style.cursor = ''; }));

  // --- Touch Swipe ---
  let touchStartX = 0, touchStartY = 0, touchMoveX = 0, isSwiping = false;
  viewer.addEventListener('touchstart', (e) => { if (annotationsActive) return; const t = e.touches[0]; touchStartX = t.clientX; touchStartY = t.clientY; touchMoveX = touchStartX; isSwiping = true; }, { passive: true });
  viewer.addEventListener('touchmove', (e) => { if (!isSwiping) return; touchMoveX = e.touches[0].clientX; }, { passive: true });
  viewer.addEventListener('touchend', () => { if (!isSwiping || !pdfDoc) return; isSwiping = false; const d = touchStartX - touchMoveX; if (Math.abs(d) > 50) d > 0 ? flipbook.turn('next') : flipbook.turn('previous'); }, { passive: true });

  // --- Sound ---
  toggleSoundBtn.addEventListener('click', () => { soundEnabled = !soundEnabled; toggleSoundBtn.classList.toggle('muted', !soundEnabled); setStatus(soundEnabled ? 'Sound ON' : 'Sound OFF'); });

  // --- Fit to Width ---
  fitWidthBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const book = flipbook.turn('size'), cw = viewer.getBoundingClientRect().width;
    currentZoom = Math.min(maxZoom, cw / book.width); resetPan(); applyTransform(); setStatus('Fit Width');
  });

  // --- Fit to Page ---
  fitPageBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    const book = flipbook.turn('size'), r = viewer.getBoundingClientRect();
    currentZoom = Math.min(maxZoom, Math.min(r.width / book.width, r.height / book.height)); resetPan(); applyTransform(); setStatus('Fit Page');
  });

  // --- View Toggle ---
  toggleViewBtn.addEventListener('click', () => {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    if (isTouchDevice) { setStatus('Single Page View'); return; }
    isSinglePage = !isSinglePage; flipbook.turn('display', isSinglePage ? 'single' : 'double'); setStatus(isSinglePage ? 'Single Page' : 'Double Page');
  });

  // --- Night Mode ---
  nightModeBtn.addEventListener('click', () => { document.body.classList.toggle('night'); setStatus(document.body.classList.contains('night') ? 'Night ON' : 'Day ON'); });

  // --- Immersive Mode ---
  immersiveBtn.addEventListener('click', () => {
    document.body.classList.toggle('immersive');
    const on = document.body.classList.contains('immersive');
    setStatus(on ? 'Immersive Mode ON' : 'Immersive Mode OFF');
  });

  // --- Print ---
  printBtn.addEventListener('click', () => { if (!pdfDoc) { setStatus('Load a PDF first.'); return; } window.print(); });

  // --- Presentation Mode ---
  function updatePresentationPage(pageNum) { if (!pdfDoc) return; presentationPage.textContent = `Page ${pageNum} / ${pdfDoc.numPages}`; presentationProgress.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`; }
  function showPresentationUI() { presentationOverlay.classList.add('show-presentation-ui'); clearTimeout(presentationHideTimer); presentationHideTimer = setTimeout(() => presentationOverlay.classList.remove('show-presentation-ui'), 4000); }
  function enterPresentationMode() {
    if (!pdfDoc) { setStatus('Load a PDF first.'); return; }
    isPresentationMode = true; document.body.classList.add('presentation-active'); presentationOverlay.classList.remove('hidden');
    updatePresentationPage(flipbook.turn('page') || 1);
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    showPresentationUI(); setStatus('Presentation ON');
  }
  function exitPresentationMode() {
    isPresentationMode = false; document.body.classList.remove('presentation-active'); presentationOverlay.classList.add('hidden');
    presentationOverlay.classList.remove('show-presentation-ui'); clearTimeout(presentationHideTimer);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    setStatus('Presentation OFF');
  }
  presentationBtn.addEventListener('click', (e) => { e.stopPropagation(); isPresentationMode ? exitPresentationMode() : enterPresentationMode(); });
  presentationPrev.addEventListener('click', (e) => { e.stopPropagation(); flipbook.turn('previous'); });
  presentationNext.addEventListener('click', (e) => { e.stopPropagation(); flipbook.turn('next'); });
  presentationExit.addEventListener('click', (e) => { e.stopPropagation(); exitPresentationMode(); });
  presentationOverlay.addEventListener('click', (e) => {
    if (e.target.closest('.presentation-bar') || e.target.closest('.presentation-page-info')) return;
    if (presentationOverlay.classList.contains('show-presentation-ui')) { presentationOverlay.classList.remove('show-presentation-ui'); clearTimeout(presentationHideTimer); }
    else showPresentationUI();
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (isPresentationMode) {
      if (e.key === 'Escape') { exitPresentationMode(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); flipbook.turn('next'); showPresentationUI(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); flipbook.turn('previous'); showPresentationUI(); }
      if (e.key === 'f') { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' && pdfDoc) flipbook.turn('next');
    if (e.key === 'ArrowLeft' && pdfDoc) flipbook.turn('previous');
    if (e.key === 'n') nightModeBtn.click();
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); if (!gotoModal.classList.contains('hidden')) closeGotoModal(); else openGotoModal(); }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && pdfDoc) { presentationBtn.click(); }
  });

  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isPresentationMode) exitPresentationMode(); });

  // --- Resize ---
  window.addEventListener('resize', () => {
    if (!pdfDoc || !flipbook.turn('options')) return;
    const vw = window.innerWidth;
    let bookWidth, bookHeight;
    if (isSinglePage) { bookWidth = vw <= 420 ? vw - 24 : vw <= 768 ? vw - 20 : Math.min(900, vw - 280); bookHeight = Math.min(600, window.innerHeight * 0.65); }
    else { bookWidth = 900; bookHeight = 600; }
    flipbook.turn('size', bookWidth, bookHeight);
    flipbook.find('.page').each((_, d) => { const l = d.querySelector('.annotationLayer'); if (l) { l.width = d.clientWidth; l.height = d.clientHeight; } });
  });

  // Initial
  setStatus('No file selected');
  updateRecentUI();
  updateBookmarkUI();
});