(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mode = document.body.dataset.mode || '';
  if (!mode) return;

  const status = $('status');
  const setStatus = text => { if (status) status.textContent = text; };
  const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
  const formatError = text => setStatus(text || 'An error occurred.');

  if (mode === 'aspect') {
    const a = $('ratioW'), b = $('ratioH'), known = $('known'), side = $('knownSide');
    const gcd = (x, y) => y ? gcd(y, x % y) : x;
    const update = () => {
      const x = Number(a.value), y = Number(b.value), k = Number(known.value);
      if (![x, y, k].every(Number.isFinite) || x <= 0 || y <= 0 || k <= 0) {
        $('ratioResult').textContent = 'Enter positive values.';
        return;
      }
      const g = gcd(Math.round(x), Math.round(y));
      const result = side.value === 'width' ? Math.round(k * y / x) : Math.round(k * x / y);
      $('ratioResult').textContent = `Ratio ${Math.round(x / g)}:${Math.round(y / g)} · ${side.value === 'width' ? 'Height' : 'Width'} = ${result}px`;
    };
    [a,b,known,side].forEach(el => el.addEventListener('input',update));
    update();
    return;
  }

  const processButton = $('process');
  const originalLabel = processButton.textContent;
  const downloadLink = $('download');
  const fileInput = $('files');
  const preview = $('preview');
  const image = $('original');
  const fileName = $('filename');
  const fileSize = $('size');
  const outputInfo = $('processed');
  const MAX_BYTES = 35 * 1024 * 1024;
  const MAX_PIXELS = 50_000_000;
  let file = null;
  let outputUrl = null;
  let outputName = '';
  let sourceUrl = null;
  let isReady = false;
  let processing = false;
  let resizeRatio = null;

  // Legacy secondary download link is intentionally not part of the UI.
  // Remove it from the page completely, instead of merely recoloring it.
  if (downloadLink) downloadLink.remove();
  preview.hidden = true;
  preview.style.display = 'none';

  const resetOutput = () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = null;
    outputName = '';
    isReady = false;
    processButton.textContent = originalLabel;
    processButton.disabled = false;
    outputInfo.textContent = '';
  };

  const loaded = async f => {
    if (!f || !f.type.startsWith('image/')) return formatError('Please select an image.');
    if (f.size > MAX_BYTES) return formatError('Please choose an image smaller than 35 MB.');
    resetOutput();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(f);
    file = f;
    fileName.textContent = f.name;
    fileSize.textContent = bytes(f.size);
    image.src = sourceUrl;
    preview.hidden = false;
    preview.style.display = 'flex';
    setStatus('Image ready. Choose your settings, then process it.');
    if (mode === 'resize') {
      try {
        const img = await decode(f);
        if (file !== f) return;
        resizeRatio = {width: img.naturalWidth, height: img.naturalHeight};
        $('width').value = img.naturalWidth;
        $('height').value = img.naturalHeight;
      } catch (error) { formatError(error.message); }
    }
  };

  const decode = f => new Promise((resolve,reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {URL.revokeObjectURL(url); resolve(img);};
    img.onerror = () => {URL.revokeObjectURL(url); reject(new Error('Unable to decode this image in your browser.'));};
    img.src = url;
  });
  const exportBlob = (canvas,type,quality) => new Promise((resolve,reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Your browser could not export this format.')),type,quality);
  });

  const process = async () => {
    if (!file) return formatError('Please select an image first.');
    if (processing) return;
    processing = true;
    processButton.disabled = true;
    setStatus('Processing locally in your browser…');
    try {
      const currentFile = file;
      const img = await decode(currentFile);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w * h > MAX_PIXELS) throw new Error('Image dimensions are too large for browser processing.');
      let type = 'image/jpeg';
      let quality = .92;
      if (mode === 'resize') {
        w = Number($('width').value); h = Number($('height').value);
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 16000 || h > 16000) {
          throw new Error('Enter whole-number dimensions between 1 and 16000.');
        }
        type = $('format').value;
        quality = .9;
      } else if (mode === 'compress') {
        quality = Number($('quality').value)/100;
        type = currentFile.type === 'image/png' || currentFile.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      } else if (mode === 'convert') {
        type = document.body.dataset.target;
      }
      if (w * h > MAX_PIXELS) throw new Error('Output dimensions are too large.');
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not supported.');
      if (type === 'image/jpeg') {ctx.fillStyle = '#ffffff';ctx.fillRect(0,0,w,h);}
      ctx.drawImage(img,0,0,w,h);
      const result = await exportBlob(canvas,type,quality);
      if (file !== currentFile) return;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(result);
      const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp';
      outputName = (currentFile.name.replace(/\.[^.]+$/, '') || 'image') + '-pixelkit.' + ext;
      isReady = true;
      processButton.textContent = `Download ${ext.toUpperCase()} ↓`;
      outputInfo.textContent = `Output: ${bytes(result.size)} • ${w} × ${h} px`;
      const reduction = Math.round((1 - result.size / currentFile.size) * 100);
      setStatus(mode === 'compress' ? `${reduction >= 0 ? `${reduction}% smaller` : `${-reduction}% larger`}. Results vary by image content and format.` : 'Done. Your image is ready to download.');
    } catch (error) {
      resetOutput();
      formatError(error.message);
    } finally {
      processing = false;
      processButton.disabled = false;
    }
  };

  const download = () => {
    if (!isReady || !outputUrl) return;
    // Trigger download synchronously during the user's click event.
    const link = document.createElement('a');
    link.href = outputUrl;
    link.download = outputName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus('Download started. You can download again or choose another image.');
  };

  fileInput.addEventListener('change', e => loaded(e.target.files[0]));
  $('choose').addEventListener('click', () => fileInput.click());
  const drop = $('drop');
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');loaded(e.dataTransfer.files[0]);});
  processButton.addEventListener('click', () => isReady ? download() : process());
  ['quality','width','height','format'].forEach(key => {
    const el = $(key);
    if (el) el.addEventListener('change', () => {
      if (isReady) {resetOutput();setStatus('Settings changed. Process your image again.');}
    });
  });
  if (mode === 'resize') {
    for (const key of ['width','height']) {
      $(key).addEventListener('input', () => {
        if (isReady) {resetOutput();setStatus('Settings changed. Process your image again.');}
        if (!$('lock').checked || !resizeRatio) return;
        const value = Number($(key).value);
        if (!Number.isFinite(value) || value <= 0) return;
        if (key === 'width') $('height').value = Math.max(1,Math.round(value * resizeRatio.height / resizeRatio.width));
        else $('width').value = Math.max(1,Math.round(value * resizeRatio.width / resizeRatio.height));
      });
    }
  }
})();
