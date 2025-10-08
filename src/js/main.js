window.addEventListener('load', () => {
  if (typeof pdfjsLib === 'undefined') {
    alert('❌ PDF.js failed to load.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = './src/js/pdf.worker.min.js';

  const fileInput = document.getElementById('fileInput');
  const loadBtn = document.getElementById('loadBtn');
  const status = document.getElementById('status');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const pageNumberInput = document.getElementById('pageNumberInput');
  const totalPages = document.getElementById('totalPages');
  const flipbookContainer = document.querySelector('.flipbook-container');
  const thumbnailContainer = document.getElementById('thumbnailContainer');
  const outlineContainer = document.getElementById('outlineContainer');
  const flipbook = $('#flipbook');

  let pdfDoc = null;
  let currentZoom = 1;
  const minZoom = 0.5;
  const maxZoom = 2.5;
  const zoomStep = 0.1;
  let isDragging = false, startX, startY, translateX = 0, translateY = 0;
  let isSinglePage = false;

  function setStatus(msg) {
    status.textContent = msg;
  }

  // 🖼️ Render PDF page to image (used for both pages & thumbnails)
  async function renderPage(pdf, pageNumber, scale = 1.5) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    // Canvas for image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.9);
    return img;
  }

  // 📖 Load PDF
  async function loadPDF(arrayBuffer) {
    try {
      setStatus('📂 Loading PDF...');
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages.textContent = `/ ${pdfDoc.numPages} pages`;

      setStatus(`📄 Rendering ${pdfDoc.numPages} pages...`);
      flipbook.html('');
      thumbnailContainer.innerHTML = '';
      outlineContainer.innerHTML = '';

      // Generate pages and thumbnails
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageImg = await renderPage(pdfDoc, i);
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.appendChild(pageImg);
        flipbook.append(pageDiv);

        // Annotation Layer (Drawing / Highlighting)
        addAnnotationLayer(pageDiv)

        // Thumbnails
        const thumbImg = await renderPage(pdfDoc, i, 0.2);
        thumbImg.className = 'thumbnail';
        thumbImg.title = `Page ${i}`;
        thumbImg.addEventListener('click', () => flipbook.turn('page', i));
        thumbnailContainer.appendChild(thumbImg);

        setStatus(`Rendering page ${i} of ${pdfDoc.numPages}...`);
      }

      // Render Outline (Bookmarks)
      const outline = await pdfDoc.getOutline();
      if (outline) {
        outline.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item.title;
          li.addEventListener('click', async () => {
            const dest = await pdfDoc.getDestination(item.dest);
            const pageIndex = pdfDoc.getPageIndex(dest[0]);
            flipbook.turn('page', pageIndex + 1);
          });
          outlineContainer.appendChild(li);
        });
      }

      // Initialize Flipbook
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
        });
        setStatus(`✅ Loaded ${pdfDoc.numPages} pages.`);
      }, 400);

    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to load PDF.');
    }
  }

    // Annotation Layer (Drawing / Highlighting)

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
    setStatus('✅ Annotations saved');
    });

    document.getElementById('loadAnnotations').addEventListener('click', () => {
    const loaded = localStorage.getItem('pdfAnnotations');
    if (loaded) {
        Object.values($('.page')).forEach(pageDiv => {
        const layer = pageDiv.querySelector('.annotationLayer');
        if(layer && layer.loadAnnotations) layer.loadAnnotations(loaded);
        });
        setStatus('✅ Annotations loaded');
    }
    });

    const annotateBtn = document.getElementById('annotateBtn');
        let annotationsActive = false;

        annotateBtn.addEventListener('click', () => {
        annotationsActive = !annotationsActive; // toggle on/off
        annotateBtn.textContent = annotationsActive ? '🛑 Stop Annotation' : '✏️ Annotate';
        setStatus(annotationsActive ? '✏️ Annotation mode ON' : '✏️ Annotation mode OFF');

        // Enable or disable pointer events for all annotation canvases
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
        let tool = 'freehand'; // 'freehand' or 'highlight'
        let color = '#ff0000';
        let lineWidth = 2;

        // Store annotations for saving
        if (!window.annotations) window.annotations = {};
        if (!window.annotations[pageNumber]) window.annotations[pageNumber] = [];

        // Draw from saved annotations
        function redrawAnnotations() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const annots = window.annotations[pageNumber];
            annots.forEach(a => {
            ctx.strokeStyle = a.color;
            ctx.fillStyle = a.color;
            ctx.lineWidth = a.lineWidth;
            if(a.type === 'freehand') {
                ctx.beginPath();
                ctx.moveTo(a.points[0].x, a.points[0].y);
                a.points.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.stroke();
            } else if(a.type === 'highlight') {
                ctx.fillRect(a.x, a.y, a.width, a.height);
            }
            });
        }

        canvas.addEventListener('mousedown', (e) => {
            drawing = true;
            startX = e.offsetX;
            startY = e.offsetY;
            if(tool === 'freehand') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            window.currentPoints = [{x: startX, y: startY}];
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if(!drawing) return;
            const x = e.offsetX;
            const y = e.offsetY;

            if(tool === 'freehand') {
            ctx.lineTo(x, y);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            window.currentPoints.push({x, y});
            } else if(tool === 'highlight') {
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

            if(tool === 'freehand') {
            window.annotations[pageNumber].push({
                type: 'freehand',
                color,
                lineWidth,
                points: window.currentPoints
            });
            window.currentPoints = [];
            } else if(tool === 'highlight') {
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
            if(tool === 'freehand') window.currentPoints = [];
        });

        // Tool switch & color picker (you can link these to UI buttons)
        canvas.setTool = (newTool) => { tool = newTool; };
        canvas.setColor = (newColor) => { color = newColor; };

        // Save annotations to JSON
        canvas.saveAnnotations = () => {
            return JSON.stringify(window.annotations);
        };

        // Load annotations from JSON
        canvas.loadAnnotations = (json) => {
            window.annotations = JSON.parse(json);
            redrawAnnotations();
        };
    }

  // 📥 Load Button
  loadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) {
      setStatus('⚠️ Please select a PDF file first.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => loadPDF(e.target.result);
    reader.readAsArrayBuffer(file);
  });

  // ⏮️/⏭️ Buttons
  prevBtn.addEventListener('click', () => flipbook.turn('previous'));
  nextBtn.addEventListener('click', () => flipbook.turn('next'));

  // 🔢 Jump to page number
  pageNumberInput.addEventListener('change', () => {
    const pageNum = parseInt(pageNumberInput.value);
    if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
      flipbook.turn('page', pageNum);
    } else {
      setStatus('⚠️ Invalid page number.');
    }
  });

  // 🔍 Zoom
  function applyTransform() {
    flipbook.css({
      transform: `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`,
      transformOrigin: 'center center',
      transition: 'transform 0.1s ease',
    });
  }

  function resetPan() {
    translateX = 0;
    translateY = 0;
    applyTransform();
  }

  zoomInBtn.addEventListener('click', () => {
    if (currentZoom < maxZoom) {
      currentZoom += zoomStep;
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    }
  });

  zoomOutBtn.addEventListener('click', () => {
    if (currentZoom > minZoom) {
      currentZoom -= zoomStep;
      if (currentZoom <= 1) resetPan();
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    }
  });

  // 🖱️ Ctrl + Scroll Zoom
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

  // 🖐️ Drag-to-Pan
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

// === Viewing Options ===

// 🧩 Fit to Width & Fit to Page
const fitWidthBtn = document.getElementById('fitWidthBtn');
const fitPageBtn = document.getElementById('fitPageBtn');
const toggleViewBtn = document.getElementById('toggleViewBtn');
const nightModeBtn = document.getElementById('nightModeBtn');

function fitToWidth() {
  const container = flipbookContainer.getBoundingClientRect();
  const book = flipbook[0].getBoundingClientRect();
  const newZoom = container.width / book.width;
  currentZoom = Math.min(maxZoom, newZoom);
  resetPan();
  applyTransform();
  setStatus('↔ Fit to Width');
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
  setStatus('↕ Fit to Page');
}

fitWidthBtn.addEventListener('click', fitToWidth);
fitPageBtn.addEventListener('click', fitToPage);

// 📖 Toggle Single / Double Page View
toggleViewBtn.addEventListener('click', () => {
  isSinglePage = !isSinglePage;
  const displayMode = isSinglePage ? 'single' : 'double';
  flipbook.turn('display', displayMode);
  setStatus(isSinglePage ? '📄 Single Page Mode' : '📖 Double Page Mode');
});

// 🌙 Night Mode Toggle
nightModeBtn.addEventListener('click', () => {
  document.body.classList.toggle('night');
  const active = document.body.classList.contains('night');
  nightModeBtn.textContent = active ? '☀️ Day Mode' : '🌙 Night Mode';
  setStatus(active ? '🌙 Night Mode ON' : '☀️ Day Mode ON');
});

});
