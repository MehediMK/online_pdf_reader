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
  const flipbookContainer = document.querySelector('.flipbook-container');
  const flipbook = $('#flipbook');

  let currentZoom = 1; // 🔍 Default zoom level
  const minZoom = 0.5;
  const maxZoom = 2.5;
  const zoomStep = 0.1;

  // 🧭 Pan variables
  let isDragging = false;
  let startX, startY;
  let translateX = 0;
  let translateY = 0;

  function setStatus(msg) {
    status.textContent = msg;
  }

  // 🖼️ Render a single PDF page to image
  async function renderPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.9);

    const pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.appendChild(img);

    return pageDiv;
  }

  // 📖 Load and render PDF into flipbook
  async function loadPDF(arrayBuffer) {
    try {
      setStatus('📂 Loading PDF...');
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setStatus(`📄 Rendering ${pdfDoc.numPages} pages...`);

      flipbook.html('');

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageDiv = await renderPage(pdfDoc, i);
        flipbook.append(pageDiv);
        setStatus(`Rendering page ${i} of ${pdfDoc.numPages}...`);
      }

      // Delay slightly before initializing Turn.js
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
      }, 300);

    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to load PDF.');
    }
  }

  // 🎯 Load PDF Button
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

  // ⏪/⏩ Navigation
  prevBtn.addEventListener('click', () => flipbook.turn('previous'));
  nextBtn.addEventListener('click', () => flipbook.turn('next'));

  // 🔍 Apply Zoom + Pan
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

  // 🔍 Zoom In/Out Buttons
  zoomInBtn.addEventListener('click', () => {
    if (currentZoom < maxZoom) {
      currentZoom += zoomStep;
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    } else {
      setStatus('🔎 Maximum zoom reached.');
    }
  });

  zoomOutBtn.addEventListener('click', () => {
    if (currentZoom > minZoom) {
      currentZoom -= zoomStep;
      if (currentZoom <= 1) resetPan();
      applyTransform();
      setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
    } else {
      setStatus('🔎 Minimum zoom reached.');
    }
  });

  // 🖱️ Ctrl + Scroll Zoom
  flipbookContainer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // only zoom if Ctrl pressed
    e.preventDefault();

    if (e.deltaY < 0 && currentZoom < maxZoom) {
      currentZoom += zoomStep;
    } else if (e.deltaY > 0 && currentZoom > minZoom) {
      currentZoom -= zoomStep;
      if (currentZoom <= 1) resetPan();
    }

    applyTransform();
    setStatus(`Zoom: ${(currentZoom * 100).toFixed(0)}%`);
  });

  // 🖐️ Drag-to-Pan
  flipbookContainer.addEventListener('mousedown', (e) => {
    if (currentZoom <= 1) return; // only when zoomed
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

  flipbookContainer.addEventListener('mouseup', () => {
    isDragging = false;
    flipbookContainer.style.cursor = 'default';
  });

  flipbookContainer.addEventListener('mouseleave', () => {
    isDragging = false;
    flipbookContainer.style.cursor = 'default';
  });
});
