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

  function setStatus(msg) {
    status.textContent = msg;
  }

  // 🖼️ Render PDF page to image (used for both pages & thumbnails)
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
let isSinglePage = false;

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
