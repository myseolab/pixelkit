(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mode = document.body.dataset.mode || '';
  if (!['convert', 'compress', 'resize'].includes(mode)) return;

  const fileInput = $('files');
  const preview = $('preview');
  const previewImg = $('original');
  const action = $('process');
  const status = $('status');
  const outputInfo = $('processed');
  const fileName = $('filename');
  const fileSize = $('size');
  const originalLabel = action.textContent.trim();
  const MAX_BYTES = 35 * 1024 * 1024;
  const MAX_PIXELS = 50_000_000;
  const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  const note = value => { status.textContent = value; };
  const error = message => note(message || 'Processing failed. Please try another image.');
  const oldDownload = $('download');
  if (oldDownload) oldDownload.remove();

  let selected = null;
  let sourceUrl = null;
  let sourceImg = null;
  let readyUrl = null;
  let readyName = '';
  let readyType = '';
  let resizeRatio = null;
  let loadId = 0;

  function releaseResult() {
    if (readyUrl && readyUrl.startsWith('blob:')) URL.revokeObjectURL(readyUrl);
    readyUrl = null; readyName = ''; readyType = '';
    action.textContent = originalLabel;
    outputInfo.textContent = '';
  }

  function selectFile(file) {
    const myId = ++loadId;
    if (!file) return;
    if (!file.type.startsWith('image/')) return error('Please choose an image file.');
    if (file.size > MAX_BYTES) return error('Please choose an image smaller than 35 MB.');
    releaseResult();
    selected = file;
    sourceImg = null;
    action.disabled = true;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    previewImg.src = sourceUrl;
    fileName.textContent = file.name;
    fileSize.textContent = bytes(file.size);
    preview.hidden = false;
    preview.style.display = 'flex';
    note('Loading your image…');
    const img = new Image();
    img.onload = () => {
      if (loadId !== myId) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
        action.disabled = true;
        return error('This image is too large to process in your browser.');
      }
      sourceImg = img;
      if (mode === 'resize') {
        resizeRatio = { width: img.naturalWidth, height: img.naturalHeight };
        $('width').value = img.naturalWidth;
        $('height').value = img.naturalHeight;
      }
      action.disabled = false;
      note('Image ready. Click the blue button to convert and download.');
    };
    img.onerror = () => {
      if (loadId !== myId) return;
      action.disabled = true;
      error('Your browser could not read this image.');
    };
    img.src = sourceUrl;
  }

  function requestDownload(href, name) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  // No awaited Promise between the user's click and the download.
  // The encoded result is created synchronously within the click handler.
  function processAndDownload() {
    if (readyUrl && readyName) {
      requestDownload(readyUrl, readyName);
      note('Download started. Click again if you need another copy.');
      return;
    }
    if (!selected || !sourceImg) return error('Please choose an image and wait until it loads.');

    action.disabled = true;
    note('Preparing your image…');
    try {
      let width = sourceImg.naturalWidth;
      let height = sourceImg.naturalHeight;
      let mime = 'image/jpeg';
      let quality = 0.92;
      if (mode === 'resize') {
        width = Number($('width').value);
        height = Number($('height').value);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16000 || height > 16000) {
          throw new Error('Enter dimensions between 1 and 16000 pixels.');
        }
        mime = $('format').value;
        quality = .90;
      } else if (mode === 'compress') {
        mime = (selected.type === 'image/png' || selected.type === 'image/webp') ? 'image/webp' : 'image/jpeg';
        quality = Number($('quality').value) / 100;
      } else if (mode === 'convert') {
        mime = document.body.dataset.target || 'image/jpeg';
      }
      if (width * height > MAX_PIXELS) throw new Error('Output dimensions are too large for browser processing.');
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('Unsupported output format.');

      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available in this browser.');
      if (mime === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(sourceImg, 0, 0, width, height);
      const dataUrl = canvas.toDataURL(mime, quality);
      if (!dataUrl.startsWith('data:' + mime + ';base64,')) {
        throw new Error('Your browser could not encode this output format.');
      }
      const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
      const name = (selected.name.replace(/\.[^.]+$/,'') || 'image') + '-pixelkit.' + extension;

      // Start the download as part of this same user-initiated click.
      requestDownload(dataUrl, name);
      action.textContent = 'Download ' + extension.toUpperCase() + ' ↓';
      // Keep the data URL for optional re-download (no extra click required for first download).
      readyUrl = dataUrl;
      readyName = name;
      readyType = mime;
      const approximateBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
      outputInfo.textContent = `Output: ${bytes(approximateBytes)} · ${width} × ${height} px`;
      note('Download started. Your image is ready.');
    } catch (exc) {
      releaseResult();
      error(exc.message);
    } finally {
      action.disabled = false;
    }
  }

  fileInput.addEventListener('change', event => selectFile(event.target.files[0]));
  $('choose').addEventListener('click', () => fileInput.click());
  const dropArea = $('drop');
  dropArea.addEventListener('dragover', event => { event.preventDefault(); dropArea.classList.add('over'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('over'));
  dropArea.addEventListener('drop', event => {
    event.preventDefault();
    dropArea.classList.remove('over');
    selectFile(event.dataTransfer.files[0]);
  });
  action.addEventListener('click', processAndDownload);

  for (const key of ['quality','width','height','format']) {
    const element = $(key);
    if (element) element.addEventListener('change', () => { if (readyUrl) releaseResult(); });
  }
  if (mode === 'resize') {
    ['width','height'].forEach(key => $(key).addEventListener('input', () => {
      if (readyUrl) releaseResult();
      if (!$('lock').checked || !resizeRatio) return;
      const value = Number($(key).value);
      if (!Number.isFinite(value) || value <= 0) return;
      if (key === 'width') $('height').value = Math.max(1,Math.round(value * resizeRatio.height / resizeRatio.width));
      else $('width').value = Math.max(1,Math.round(value * resizeRatio.width / resizeRatio.height));
    }));
  }
})();
