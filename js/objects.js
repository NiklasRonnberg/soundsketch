let nextId = 1;
export class ObjectManager {
  constructor(layer, viewport, recorder, snap, playback, setStatus) {
    this.layer = layer; this.viewport = viewport; this.recorder = recorder;
    this.snap = snap; this.playback = playback; this.setStatus = setStatus;
    this.items = [];
    this.selectedItems = new Set();
    this.recordingMode = 'hold';
  }
  setRecordingMode(mode) {
    this.recordingMode = mode === 'click' ? 'click' : 'hold';
    for (const item of this.items) this.updateRecordLabel(item);
  }
  updateRecordLabel(item) {
    if (item.recordButton.classList.contains('playback') || item.recorder?.state === 'recording') return;
    item.recordLabel.textContent = this.recordingMode === 'click' ? 'Click to start recording or drop audio file' : 'Hold to record or drop audio file';
  }
  setSelection(items) {
    this.selectedItems = new Set(items);
    for (const item of this.items) item.element.classList.toggle('selected', this.selectedItems.has(item));
  }
  clearSelection() { this.setSelection([]); }
  setupMarquee(world) {
    let marquee = null;
    world.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.sound-object, .toolbar, .save-button, .mic-warning, .project-title-bar, .project-actions, .info-button')) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.clearSelection();
      const rectangle = document.createElement('div'); rectangle.className = 'selection-rectangle'; document.body.appendChild(rectangle);
      marquee = { id:event.pointerId, sx:event.clientX, sy:event.clientY, rectangle };
      world.setPointerCapture(event.pointerId);
    });
    world.addEventListener('pointermove', event => {
      if (!marquee || event.pointerId !== marquee.id) return;
      const left=Math.min(marquee.sx,event.clientX), top=Math.min(marquee.sy,event.clientY);
      const right=Math.max(marquee.sx,event.clientX), bottom=Math.max(marquee.sy,event.clientY);
      Object.assign(marquee.rectangle.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
      this.setSelection(this.items.filter(item => { const rect=item.element.getBoundingClientRect(); return rect.right>=left&&rect.left<=right&&rect.bottom>=top&&rect.top<=bottom; }));
    });
    const end = event => { if (!marquee || (event?.pointerId!==undefined && event.pointerId!==marquee.id)) return; marquee.rectangle.remove(); marquee=null; };
    world.addEventListener('pointerup',end); world.addEventListener('pointercancel',end); world.addEventListener('lostpointercapture',end);
  }
  add(opts = {}) {
    // Explicit positions are used by imports/paste. New objects get a clear free position instead of
    // being created on top of an existing object's interactive image/content area.
    let x = opts.x;
    let y = opts.y;
    if (x == null || y == null) {
      const width = 250;
      const height = 284;
      const gap = 28;
      x = 120;
      y = 120;
      const overlaps = (px, py, other) => {
        const ow = other.element?.offsetWidth || width;
        const oh = other.element?.offsetHeight || height;
        return px < other.x + ow + gap && px + width + gap > other.x &&
               py < other.y + oh + gap && py + height + gap > other.y;
      };
      let attempts = 0;
      while (this.items.some(other => overlaps(x, y, other)) && attempts < 200) {
        x += width + gap;
        if (x > 1200) { x = 120; y += height + gap; }
        attempts++;
      }
    }
    const item = { id: nextId++, x, y, title: opts.title || '', description: '', audioUrl: null, audioBlob: null, audioDuration: 0, recorder: null };
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
    this.updateRecordLabel(item);
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
    this.selectedItems.delete(item);
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
        if (!connection) {
          const overlapLeft = Math.max(a.x, b.x);
          const overlapRight = Math.min(a.x + aw, b.x + bw);
          if (overlapRight > overlapLeft) {
            if (Math.abs(a.y + ah + gap - b.y) <= tolerance) connection = { x: overlapLeft, y: a.y + ah, width: overlapRight - overlapLeft, height: gap };
            else if (Math.abs(b.y + bh + gap - a.y) <= tolerance) connection = { x: overlapLeft, y: b.y + bh, width: overlapRight - overlapLeft, height: gap };
          }
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
    const button=item.recordButton; let pointerId=null, starting=false;
    const stop=e=>{
      if (this.recordingMode==='hold' && pointerId!==null && e?.pointerId!==undefined && e.pointerId!==pointerId) return;
      const relation=this.playback.recordingRelation(item,this.items);
      if (item.recorder?.state==='recording') { this.recorder.stop(item); if (relation.mode==='before-right') this.playback.playAfterRecording(item,this.items); }
      pointerId=null;
    };
    const start=async e=>{
      if (button.classList.contains('playback')) { e.preventDefault(); this.playback.playFrom(item,this.items); return; }
      if (this.recordingMode==='click' && item.recorder?.state==='recording') { e.preventDefault(); stop(e); return; }
      if (starting || item.recorder?.state==='recording') return;
      if (!this.recorder.stream || !this.recorder.stream.active) { this.setStatus('Enable the microphone before recording.'); return; }
      starting=true; pointerId=e.pointerId; if (this.recordingMode==='hold') button.setPointerCapture?.(e.pointerId);
      const relation=this.playback.recordingRelation(item,this.items);
      if (relation.mode==='after-left') { item.recordLabel.textContent='Waiting to record…'; item.meta.textContent='Playing preceding sounds'; await this.playback.playBeforeRecording(item,this.items); if (this.recordingMode==='hold' && pointerId===null) { starting=false; this.updateRecordLabel(item); return; } }
      const ok=await this.recorder.start(item); starting=false;
      if (ok && item.recorder?.state==='recording') { button.classList.add('recording'); item.recordLabel.textContent=this.recordingMode==='click'?'Stop recording':'Recording… release'; item.meta.textContent='Recording audio'; if (relation.mode==='simultaneous') this.playback.playSimultaneousWithRecording(item,this.items); }
    };
    button.addEventListener('pointerdown',start);
    button.addEventListener('pointerup',e=>{if(this.recordingMode==='hold')stop(e);});
    button.addEventListener('pointercancel',e=>{if(this.recordingMode==='hold')stop(e);});
    button.addEventListener('lostpointercapture',e=>{if(this.recordingMode==='hold')stop(e);});
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
    const el=item.element; let drag=null;
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0 || e.target.closest('input, textarea, button, .image-preview, .object-content')) return;
      e.stopPropagation();
      if(!this.selectedItems.has(item)) this.setSelection([item]);
      const group=[...this.selectedItems];
      drag={sx:e.clientX,sy:e.clientY,id:e.pointerId,group,starts:new Map(group.map(candidate=>[candidate,{x:candidate.x,y:candidate.y}]))};
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove',e=>{
      if(!drag || e.pointerId!==drag.id) return;
      const dx=(e.clientX-drag.sx)/this.viewport.scale, dy=(e.clientY-drag.sy)/this.viewport.scale;
      const anchorStart=drag.starts.get(item);
      item.x=anchorStart.x+dx; item.y=anchorStart.y+dy;
      const outside=this.items.filter(candidate=>!drag.group.includes(candidate));
      const pos=this.snap.resolve(item,[item,...outside]);
      const appliedX=pos.x-anchorStart.x, appliedY=pos.y-anchorStart.y;
      for(const candidate of drag.group){ const origin=drag.starts.get(candidate); candidate.x=origin.x+appliedX; candidate.y=origin.y+appliedY; this.place(candidate); }
      this.updateConnections();
    });
    const end=e=>{ if(!drag || (e?.pointerId!==undefined && e.pointerId!==drag.id)) return; this.updateConnections(); drag=null; };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end); el.addEventListener('lostpointercapture',end);
  }

}
