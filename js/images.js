let nextImageId = 1;

const resizeIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 16 16 8"></path>
    <path d="M11 8h5v5"></path>
    <path d="M13 16H8v-5"></path>
  </svg>`;

const rotateIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 8a8 8 0 1 0 1 6"></path>
    <path d="M19 3v5h-5"></path>
  </svg>`;

export class ImageManager {
  constructor({ layer, viewport, button, input }) {
    if (!layer || !viewport || !button || !input) {
      throw new Error('ImageManager is missing a required element.');
    }

    this.layer = layer;
    this.viewport = viewport;
    this.button = button;
    this.input = input;
    this.items = [];

    button.addEventListener('click', () => {
      input.value = '';
      input.click();
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this.addFile(file);
    });

    this.setupCanvasDrop();
  }

  setupCanvasDrop() {
    const world = this.viewport.world;

    const imageFileFrom = transfer =>
      [...(transfer?.files || [])].find(file =>
        file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
      ) || null;

    // Prevent the browser's default file-drop navigation as soon as a file is over the canvas.
    for (const type of ['dragenter', 'dragover']) {
      world.addEventListener(type, event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
    }

    world.addEventListener('drop', event => {
      if (!event.dataTransfer?.types?.includes('Files')) return;

      // Always cancel browser navigation for files dropped anywhere on the canvas.
      event.preventDefault();
      event.stopPropagation();

      // Sound objects keep their own existing image-drop behavior.
      if (event.target.closest('.sound-object')) return;

      const file = imageFileFrom(event.dataTransfer);
      if (!file) return;
      this.addFile(file, this.viewport.screenToWorld(event.clientX, event.clientY));
    });

    // Safety net: if a browser targets the document/body instead of #world, do not navigate away.
    for (const type of ['dragover', 'drop']) {
      document.addEventListener(type, event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
      }, false);
    }
  }

  addFile(file, dropPosition = null) {
    if (!file.type.startsWith('image/')) return;

    const url = URL.createObjectURL(file);
    const probe = new Image();

    probe.onload = () => {
      const maxWidth = 360;
      const maxHeight = 260;
      const fit = Math.min(maxWidth / probe.naturalWidth, maxHeight / probe.naturalHeight, 1);
      const width = Math.max(80, probe.naturalWidth * fit);
      const height = width / (probe.naturalWidth / probe.naturalHeight);
      const rect = this.viewport.world.getBoundingClientRect();
      const center = this.viewport.screenToWorld(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );

      const position = dropPosition || center;
      this.add({
        x: position.x - width / 2,
        y: position.y - height / 2,
        width,
        height,
        aspectRatio: probe.naturalWidth / probe.naturalHeight,
        rotation: 0,
        url,
        fileName: file.name
      });
    };

    probe.onerror = () => URL.revokeObjectURL(url);
    probe.src = url;
  }

  add(item) {
    item.id = nextImageId++;

    const element = document.createElement('div');
    element.className = 'placed-image';
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', item.fileName);
    element.innerHTML = `
      <img class="placed-image-content" alt="">
      <button class="delete-placed-image image-control" type="button" aria-label="Delete image" title="Delete image">×</button>
      <button class="rotate-placed-image image-control" type="button" aria-label="Rotate image" title="Drag to rotate">${rotateIcon}</button>
      <button class="resize-placed-image image-control" type="button" aria-label="Resize image" title="Drag to resize proportionally">${resizeIcon}</button>`;

    item.element = element;
    item.image = element.querySelector('.placed-image-content');
    item.image.src = item.url;
    item.image.alt = item.fileName;

    const deleteButton = element.querySelector('.delete-placed-image');
    deleteButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    deleteButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.remove(item);
    });

    this.setupMove(item);
    this.setupResize(item);
    this.setupRotate(item);

    this.items.push(item);
    this.layer.appendChild(element);
    this.place(item);
    return item;
  }

  place(item) {
    Object.assign(item.element.style, {
      left: `${item.x}px`,
      top: `${item.y}px`,
      width: `${item.width}px`,
      height: `${item.height}px`,
      transform: `rotate(${item.rotation}deg)`,
      '--counter-rotation': `${-item.rotation}deg`
    });
  }

  setupMove(item) {
    const element = item.element;
    let drag = null;

    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.image-control')) return;
      event.preventDefault();
      event.stopPropagation();
      drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: item.x,
        y: item.y
      };
      element.setPointerCapture(event.pointerId);
      element.classList.add('moving');
    });

    element.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      item.x = drag.x + (event.clientX - drag.startX) / this.viewport.scale;
      item.y = drag.y + (event.clientY - drag.startY) / this.viewport.scale;
      this.place(item);
    });

    const finish = event => {
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      drag = null;
      element.classList.remove('moving');
    };

    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
    element.addEventListener('lostpointercapture', finish);
  }

  setupResize(item) {
    const handle = item.element.querySelector('.resize-placed-image');
    let resize = null;

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const angle = item.rotation * Math.PI / 180;
      resize = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: item.width,
        angle
      };
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
      if (!resize || event.pointerId !== resize.id) return;

      const screenDx = (event.clientX - resize.startX) / this.viewport.scale;
      const screenDy = (event.clientY - resize.startY) / this.viewport.scale;
      const localDx = screenDx * Math.cos(resize.angle) + screenDy * Math.sin(resize.angle);
      item.width = Math.max(80, resize.width + localDx);
      item.height = item.width / item.aspectRatio;
      this.place(item);
    });

    const finish = event => {
      if (!resize || (event?.pointerId !== undefined && event.pointerId !== resize.id)) return;
      resize = null;
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  }

  setupRotate(item) {
    const handle = item.element.querySelector('.rotate-placed-image');
    let rotate = null;

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = item.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      rotate = {
        id: event.pointerId,
        centerX,
        centerY,
        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
        rotation: item.rotation
      };
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', event => {
      if (!rotate || event.pointerId !== rotate.id) return;
      const angle = Math.atan2(event.clientY - rotate.centerY, event.clientX - rotate.centerX) * 180 / Math.PI;
      item.rotation = rotate.rotation + angle - rotate.startAngle;
      this.place(item);
    });

    const finish = event => {
      if (!rotate || (event?.pointerId !== undefined && event.pointerId !== rotate.id)) return;
      rotate = null;
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);
  }

  remove(item) {
    const index = this.items.indexOf(item);
    if (index === -1) return;
    item.element.remove();
    this.items.splice(index, 1);
    if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
  }
}
