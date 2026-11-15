let nextImageId = 1;

const resizeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8"></path><path d="M11 8h5v5"></path><path d="M13 16H8v-5"></path></svg>`;
const rotateIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a8 8 0 1 0 1 6"></path><path d="M19 3v5h-5"></path></svg>`;

export class ImageManager {
  constructor({ layer, viewport, button, input }) {
    if (!layer || !viewport || !button || !input) throw new Error('ImageManager is missing a required element.');
    this.layer = layer; this.viewport = viewport; this.button = button; this.input = input; this.items = []; this.selectedItems = new Set(); this.objectManager = null;
    button.addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) this.addFile(file); });
    this.setupCanvasDrop();
  }

  setSelection(items) {
    this.selectedItems = new Set(items);
    for (const item of this.items) item.element.classList.toggle('selected', this.selectedItems.has(item));
  }
  clearSelection() { this.setSelection([]); }

  setupCanvasDrop() {
    const world = this.viewport.world;
    const imageFileFrom = transfer => [...(transfer?.files || [])].find(file => file.type.startsWith('image/')) || null;
    const imageUrlFrom = transfer => {
      const html = transfer?.getData('text/html') || '';
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        if (img?.src) return img.src;
      }
      const uri = (transfer?.getData('text/uri-list') || '').split(/\r?\n/).find(line => line && !line.startsWith('#'));
      if (uri) return uri.trim();
      const plain = (transfer?.getData('text/plain') || '').trim();
      return /^(https?:|data:image\/|blob:)/i.test(plain) ? plain : null;
    };
    for (const type of ['dragenter','dragover']) world.addEventListener(type, event => {
      if (event.target.closest('.sound-object')) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    world.addEventListener('drop', async event => {
      if (event.target.closest('.sound-object')) return;
      const file = imageFileFrom(event.dataTransfer);
      const url = file ? null : imageUrlFrom(event.dataTransfer);
      if (!file && !url) return;
      event.preventDefault(); event.stopPropagation();
      const position = this.viewport.screenToWorld(event.clientX, event.clientY);
      if (file) { this.addFile(file, position); return; }
      await this.addBrowserImage(url, position);
    });
    for (const type of ['dragover','drop']) document.addEventListener(type, event => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    });
  }

  async addBrowserImage(url, position) {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return;
      let name = 'browser-image';
      try { name = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '') || name; } catch {}
      if (!/\.[a-z0-9]+$/i.test(name)) name += `.${(blob.type.split('/')[1] || 'png').replace('jpeg','jpg')}`;
      this.addFile(new File([blob], name, { type: blob.type }), position);
    } catch {}
  }

  addFile(file, dropPosition = null) {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file); const probe = new Image();
    probe.onload = () => {
      const fit = Math.min(360 / probe.naturalWidth, 260 / probe.naturalHeight, 1);
      const width = Math.max(80, probe.naturalWidth * fit); const height = width / (probe.naturalWidth / probe.naturalHeight);
      const rect = this.viewport.world.getBoundingClientRect();
      const center = this.viewport.screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const position = dropPosition || center;
      this.add({ x: position.x-width/2, y: position.y-height/2, width, height, aspectRatio: probe.naturalWidth/probe.naturalHeight, rotation:0, url, fileName:file.name });
    };
    probe.onerror = () => URL.revokeObjectURL(url); probe.src = url;
  }

  add(item) {
    item.id = nextImageId++;
    const element=document.createElement('div'); element.className='placed-image'; element.setAttribute('role','group'); element.setAttribute('aria-label',item.fileName);
    element.innerHTML=`<img class="placed-image-content" alt=""><button class="delete-placed-image image-control" type="button" aria-label="Delete image" title="Delete image">×</button><button class="rotate-placed-image image-control" type="button" aria-label="Rotate image" title="Drag to rotate">${rotateIcon}</button><button class="resize-placed-image image-control" type="button" aria-label="Resize image" title="Drag to resize proportionally">${resizeIcon}</button>`;
    item.element=element; item.image=element.querySelector('.placed-image-content'); item.image.src=item.url; item.image.alt=item.fileName;
    const deleteButton=element.querySelector('.delete-placed-image');
    deleteButton.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});
    deleteButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.remove(item);});
    element.addEventListener('click', event => {
      if (event.target.closest('.image-control')) return;
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        const selected = new Set(this.selectedItems);
        selected.has(item) ? selected.delete(item) : selected.add(item);
        this.setSelection([...selected]);
      } else if (!this.selectedItems.has(item)) {
        this.setSelection([item]);
        this.objectManager?.clearSelection();
      }
    });
    this.setupMove(item); this.setupResize(item); this.setupRotate(item); this.items.push(item); this.layer.appendChild(element); this.place(item); return item;
  }
  place(item){Object.assign(item.element.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.width}px`,height:`${item.height}px`,transform:`rotate(${item.rotation}deg)`,'--counter-rotation':`${-item.rotation}deg`});}
  setupMove(item) {
    const el=item.element; let drag=null;
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.target.closest('.image-control'))return;
      e.preventDefault();e.stopPropagation();
      if(!this.selectedItems.has(item)){this.setSelection([item]);this.objectManager?.clearSelection();}
      const imageGroup=[...this.selectedItems];
      const soundGroup=[...(this.objectManager?.selectedItems || [])];
      drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,imageGroup,
        imageStarts:new Map(imageGroup.map(image=>[image,{x:image.x,y:image.y}])),soundGroup,
        soundStarts:new Map(soundGroup.map(sound=>[sound,{x:sound.x,y:sound.y}]))};
      el.setPointerCapture(e.pointerId);el.classList.add('moving');
    });
    el.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=(e.clientX-drag.startX)/this.viewport.scale,dy=(e.clientY-drag.startY)/this.viewport.scale;
      for(const image of drag.imageGroup){const origin=drag.imageStarts.get(image);image.x=origin.x+dx;image.y=origin.y+dy;this.place(image);}
      for(const sound of drag.soundGroup){const origin=drag.soundStarts.get(sound);sound.x=origin.x+dx;sound.y=origin.y+dy;this.objectManager.place(sound);}
      this.objectManager?.updateConnections();
    });
    const end=e=>{if(!drag||(e?.pointerId!==undefined&&e.pointerId!==drag.id))return;drag=null;el.classList.remove('moving');this.objectManager?.updateConnections();};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
  }

  setupResize(item){const h=item.element.querySelector('.resize-placed-image');let r=null;h.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();r={id:e.pointerId,startX:e.clientX,startY:e.clientY,width:item.width,angle:item.rotation*Math.PI/180};h.setPointerCapture(e.pointerId);});h.addEventListener('pointermove',e=>{if(!r||e.pointerId!==r.id)return;const dx=(e.clientX-r.startX)/this.viewport.scale,dy=(e.clientY-r.startY)/this.viewport.scale,localDx=dx*Math.cos(r.angle)+dy*Math.sin(r.angle);item.width=Math.max(80,r.width+localDx);item.height=item.width/item.aspectRatio;this.place(item);});const end=e=>{if(!r||(e?.pointerId!==undefined&&e.pointerId!==r.id))return;r=null;};h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);h.addEventListener('lostpointercapture',end);}
  setupRotate(item){const h=item.element.querySelector('.rotate-placed-image');let r=null;h.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const rect=item.element.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;r={id:e.pointerId,cx,cy,startAngle:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI,rotation:item.rotation};h.setPointerCapture(e.pointerId);});h.addEventListener('pointermove',e=>{if(!r||e.pointerId!==r.id)return;const angle=Math.atan2(e.clientY-r.cy,e.clientX-r.cx)*180/Math.PI;item.rotation=r.rotation+angle-r.startAngle;this.place(item);});const end=e=>{if(!r||(e?.pointerId!==undefined&&e.pointerId!==r.id))return;r=null;};h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);h.addEventListener('lostpointercapture',end);}
  remove(item){const index=this.items.indexOf(item);if(index===-1)return;item.element.remove();this.items.splice(index,1);this.selectedItems.delete(item);if(item.url?.startsWith('blob:'))URL.revokeObjectURL(item.url);}
}
