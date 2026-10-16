let nextId = 1;
export class ObjectManager {
  constructor(layer, viewport, recorder, snap, playback, setStatus) {
    this.layer = layer; this.viewport = viewport; this.recorder = recorder;
    this.snap = snap; this.playback = playback; this.setStatus = setStatus;
    this.items = [];
  }
  add(opts = {}) {
    const item = { id: nextId++, x: opts.x ?? 120 + (this.items.length % 4) * 28, y: opts.y ?? 120 + (this.items.length % 4) * 28, title: opts.title || '', description: '', audioUrl: null, audioBlob: null, audioDuration: 0, recorder: null };
    const el = document.createElement('article');
    el.className = 'sound-object';
    el.innerHTML = `
      <div class="object-top">
        <span class="object-grip" title="Drag to move">⠿</span>
        <input class="object-title" type="text" maxlength="120" placeholder="Give the object a title" aria-label="Object title">
        <button class="delete-object" type="button" aria-label="Delete object" title="Delete">×</button>
      </div>
      <div class="object-content">
        <textarea class="object-description" placeholder="Write text or drop image here" aria-label="Description"></textarea>
        <img class="image-preview" alt="Added image" hidden>
        <div class="image-text-overlay"></div>
      </div>
      <div class="object-bottom">
        <button class="record-button" type="button"><span class="record-icon"></span><span class="record-label">Hold to record or drop audio file</span></button>
        <span class="object-meta"></span>
      </div>`;
    item.element = el;
    item.titleInput = el.querySelector('.object-title');
    item.descriptionInput = el.querySelector('.object-description');
    item.recordButton = el.querySelector('.record-button');
    item.recordLabel = el.querySelector('.record-label');
    item.meta = el.querySelector('.object-meta');
    item.content = el.querySelector('.object-content');
    item.image = el.querySelector('.image-preview');
    item.imageTextOverlay = el.querySelector('.image-text-overlay');
    item.titleInput.value = item.title;
    item.onAudioReady = () => {
      item.recordButton.classList.remove('recording');
      item.recordButton.classList.add('playback');
      item.recordLabel.textContent = 'Play';
      item.meta.textContent = `Audio · ${item.audioDuration.toFixed(1)} s`;
      this.setStatus('The recording was saved in the object.');
    };
    el.querySelector('.delete-object').addEventListener('click', () => this.remove(item));
    item.titleInput.addEventListener('pointerdown', e => e.stopPropagation());
    item.descriptionInput.addEventListener('pointerdown', e => e.stopPropagation());
    item.descriptionInput.addEventListener('input', () => { item.description = item.descriptionInput.value; item.imageTextOverlay.textContent = item.description; });
    const beginAnnotationEdit = e => {
      if (!item.content.classList.contains('has-image')) return;
      e.preventDefault();
      e.stopPropagation();
      item.content.classList.add('editing-annotation');
      requestAnimationFrame(() => {
        item.descriptionInput.focus({ preventScroll: true });
        item.descriptionInput.select();
      });
    };
    item.image.addEventListener('dblclick', beginAnnotationEdit);
    item.content.addEventListener('dblclick', beginAnnotationEdit);
    item.descriptionInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') item.descriptionInput.blur();
    });
    item.descriptionInput.addEventListener('blur', () => {
      if (!item.content.classList.contains('editing-annotation')) return;
      item.content.classList.remove('editing-annotation');
      item.description = item.descriptionInput.value;
      item.imageTextOverlay.textContent = item.description;
    });
    this.setupRecording(item);
    this.setupAudioDrop(item);
    this.setupImageDrop(item);
    this.setupDrag(item);
    this.items.push(item);
    this.layer.appendChild(el);
    this.place(item);
    this.updateConnections();
    this.refreshScale();
    item.titleInput.focus();
    return item;
  }
  remove(item) {
    if (item.recorder?.state === 'recording') item.recorder.stop();
    if (item.activeAudio) { item.activeAudio.pause(); item.activeAudio = null; }
    if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
    if (item.imageIsObjectUrl && item.imageUrl) URL.revokeObjectURL(item.imageUrl);
    item.element.remove();
    this.items = this.items.filter(x => x !== item);
    this.updateConnections();
  }
  updateConnections() {
    this.layer.querySelectorAll('.snap-connection').forEach(el => el.remove());
    const tolerance = 2, gap = this.snap.gap;
    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        const a = this.items[i], b = this.items[j];
        const aw = a.element.offsetWidth, ah = a.element.offsetHeight;
        const bw = b.element.offsetWidth, bh = b.element.offsetHeight;
        let connection = null;
        if (Math.abs(a.y - b.y) <= tolerance) {
          if (Math.abs(a.x + aw + gap - b.x) <= tolerance) connection = { x: a.x + aw, y: a.y, width: gap, height: Math.min(ah, bh) };
          else if (Math.abs(b.x + bw + gap - a.x) <= tolerance) connection = { x: b.x + bw, y: b.y, width: gap, height: Math.min(ah, bh) };
        }
        if (!connection && Math.abs(a.x - b.x) <= tolerance) {
          if (Math.abs(a.y + ah + gap - b.y) <= tolerance) connection = { x: a.x, y: a.y + ah, width: Math.min(aw, bw), height: gap };
          else if (Math.abs(b.y + bh + gap - a.y) <= tolerance) connection = { x: b.x, y: b.y + bh, width: Math.min(aw, bw), height: gap };
        }
        if (connection) {
          const el = document.createElement('div');
          el.className = 'snap-connection';
          el.style.left = connection.x + 'px';
          el.style.top = connection.y + 'px';
          el.style.width = connection.width + 'px';
          el.style.height = connection.height + 'px';
          this.layer.prepend(el);
        }
      }
    }
  }
  place(item) { item.element.style.left = `${item.x}px`; item.element.style.top = `${item.y}px`; }
  refreshScale() { for (const item of this.items) this.place(item); }
  setupRecording(item) {
    const button = item.recordButton;
    let pointerId = null, starting = false;
    const start = async e => {
      if (button.classList.contains('playback')) {
        e.preventDefault();
        this.playback.playFrom(item, this.items);
        return;
      }
      if (starting || item.recorder?.state === 'recording') return;
      if (!this.recorder.stream || !this.recorder.stream.active) {
        this.setStatus('Enable the microphone before recording.');
        return;
      }
      starting = true; pointerId = e.pointerId;
      button.setPointerCapture?.(e.pointerId);
      const ok = await this.recorder.start(item);
      starting = false;
      if (ok && item.recorder?.state === 'recording') {
        button.classList.add('recording');
        item.recordLabel.textContent = 'Recording… release';
        item.meta.textContent = 'Recording audio';
      }
    };
    const stop = e => {
      if (pointerId !== null && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      if (item.recorder?.state === 'recording') this.recorder.stop(item);
      pointerId = null;
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    button.addEventListener('click', e => {
      if (button.classList.contains('playback')) this.playback.playFrom(item, this.items);
    });
  }
  setupAudioDrop(item) {
    const button = item.recordButton;
    const clearDragState = () => button.classList.remove('audio-drag-over');
    button.addEventListener('dragenter', e => {
      e.preventDefault(); e.stopPropagation();
      if (!button.classList.contains('playback')) button.classList.add('audio-drag-over');
    });
    button.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    button.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); clearDragState(); });
    button.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); clearDragState();
      const file = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('audio/'));
      if (!file) return;
      if (item.activeAudio) { item.activeAudio.pause(); item.activeAudio = null; }
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      item.audioBlob = file;
      item.audioUrl = URL.createObjectURL(file);
      const probe = document.createElement('audio');
      probe.preload = 'metadata';
      probe.src = item.audioUrl;
      const finish = duration => {
        item.audioDuration = Number.isFinite(duration) ? duration : 0;
        item.onAudioReady?.();
        probe.removeAttribute('src');
        probe.load();
      };
      probe.addEventListener('loadedmetadata', () => finish(probe.duration), { once: true });
      probe.addEventListener('error', () => finish(0), { once: true });
    });
  }
  setupImageDrop(item) {
    const displayImage = (src, isObjectUrl = false) => {
      if (item.imageIsObjectUrl && item.imageUrl) URL.revokeObjectURL(item.imageUrl);
      item.imageUrl = src;
      item.imageIsObjectUrl = isObjectUrl;
      item.image.onload = () => {
        item.image.hidden = false;
        item.imageTextOverlay.textContent = item.descriptionInput.value;
        item.content.classList.add('has-image');
      };
      item.image.src = src;
    };
    item.content.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      item.content.classList.add('drag-over');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    item.content.addEventListener('dragleave', () => item.content.classList.remove('drag-over'));
    item.content.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      item.content.classList.remove('drag-over');
      const transfer = e.dataTransfer;
      const file = [...(transfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (file) {
        item.imageFileName = file.name;
        displayImage(URL.createObjectURL(file), true);
        return;
      }
      const html = transfer?.getData('text/html') || '';
      if (html) {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const draggedImage = parsed.querySelector('img');
        if (draggedImage?.src) {
          try { item.imageFileName = decodeURIComponent(new URL(draggedImage.src).pathname.split('/').pop() || '') || 'browser-image'; } catch { item.imageFileName = 'browser-image'; }
          displayImage(draggedImage.src);
          return;
        }
      }
      const uriList = transfer?.getData('text/uri-list') || '';
      const imageUrl = uriList.split(/\r?\n/).find(line => line && !line.startsWith('#'));
      if (imageUrl) {
        try { item.imageFileName = decodeURIComponent(new URL(imageUrl.trim()).pathname.split('/').pop() || '') || 'browser-image'; } catch { item.imageFileName = 'browser-image'; }
        displayImage(imageUrl.trim());
        return;
      }
      this.setStatus('Drop an image file or drag an image from another browser window.');
    });
  }
  setupDrag(item) {
    const el = item.element;
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('input, textarea, button, .image-preview')) return;
      e.stopPropagation();
      drag = { sx: e.clientX, sy: e.clientY, x: item.x, y: item.y, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      el.classList.add('selected');
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / this.viewport.scale;
      const dy = (e.clientY - drag.sy) / this.viewport.scale;
      item.x = drag.x + dx; item.y = drag.y + dy;
      const pos = this.snap.resolve(item, this.items);
      item.x = pos.x; item.y = pos.y;
      this.place(item);
      this.updateConnections();
    });
    const end = e => {
      if (!drag) return;
      item.x = Math.max(0, item.x); item.y = Math.max(0, item.y);
      const pos = this.snap.resolve(item, this.items);
      item.x = pos.x; item.y = pos.y;
      this.place(item);
      this.updateConnections();
      drag = null; el.classList.remove('selected');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }
}
