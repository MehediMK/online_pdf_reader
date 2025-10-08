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
  const flipbook = $('#flipbook');

  let currentZoom = 1; // 🔍 Default zoom level
  const minZoom = 0.5;
  const maxZoom = 2.0;
  const zoomStep = 0.1;


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

  // 🎯 Button Actions
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

  prevBtn.addEventListener('click', () => flipbook.turn('previous'));
  nextBtn.addEventListener('click', () => flipbook.turn('next'));

  // 🔍 Zoom In / Out Controls
  function applyZoom() {
    const scale = currentZoom;
    flipbook.css({
      transform: `scale(${scale})`,
      transformOrigin: 'center center',
      transition: 'transform 0.3s ease',
    });
    setStatus(`🔍 Zoom: ${(scale * 100).toFixed(0)}%`);
  }

  zoomInBtn.addEventListener('click', () => {
    if (currentZoom < maxZoom) {
      currentZoom += zoomStep;
      applyZoom();
    } else {
      setStatus('🔎 Maximum zoom reached.');
    }
  });

  zoomOutBtn.addEventListener('click', () => {
    if (currentZoom > minZoom) {
      currentZoom -= zoomStep;
      applyZoom();
    } else {
      setStatus('🔎 Minimum zoom reached.');
    }
  });

});
