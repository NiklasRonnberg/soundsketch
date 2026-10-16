export class ObjectClipboard {
  constructor(manager) {
    this.manager = manager;
    this.selected = null;
    this.copied = null;
    this.pasteCount = 0;
    this.bind();
  }
  bind() {
    this.manager.layer.addEventListener('pointerdown', event => {
      const element = event.target.closest('.sound-object');
      if (!element) return;
      const item = this.manager.items.find(candidate => candidate.element === element);
      if (item) this.select(item);
    }, true);
    document.addEventListener('keydown', event => this.onKeyDown(event));
  }
  select(item) {
    for (const candidate of this.manager.items) candidate.element.classList.toggle('selected', candidate === item);
    this.selected = item;
  }
  isEditingText() {
    return document.activeElement?.matches('input, textarea, [contenteditable="true"]');
  }
  onKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || this.isEditingText()) return;
    const key = event.key.toLowerCase();
    if (key === 'c' && this.selected) {
      event.preventDefault();
      this.copied = this.snapshot(this.selected);
      this.pasteCount = 0;
    }
    if (key === 'v' && this.copied) {
      event.preventDefault();
      this.paste();
    }
  }
  snapshot(item) {
    return {
      title: item.titleInput.value,
      description: item.descriptionInput.value,
      audioBlob: item.audioBlob || null,
      audioDuration: item.audioDuration || 0,
      imageUrl: item.imageUrl || '',
      imageFileName: item.imageFileName || '',
      x: item.x,
      y: item.y
    };
  }
  paste() {
    const source = this.copied;
    this.pasteCount += 1;
    const offset = 28 * this.pasteCount;
    const item = this.manager.add({ x: source.x + offset, y: source.y + offset, title: source.title });
    item.description = source.description;
    item.descriptionInput.value = source.description;
    item.imageTextOverlay.textContent = source.description;
    if (source.audioBlob) {
      item.audioBlob = source.audioBlob;
      item.audioUrl = URL.createObjectURL(source.audioBlob);
      item.audioDuration = source.audioDuration;
      item.onAudioReady?.();
    }
    if (source.imageUrl) this.copyImage(source, item);
    this.select(item);
    item.titleInput.blur();
  }
  async copyImage(source, item) {
    let url = source.imageUrl;
    let isObjectUrl = false;
    if (source.imageUrl.startsWith('blob:')) {
      try {
        const blob = await fetch(source.imageUrl).then(response => response.blob());
        url = URL.createObjectURL(blob);
        isObjectUrl = true;
      } catch {
        return;
      }
    }
    item.imageUrl = url;
    item.imageIsObjectUrl = isObjectUrl;
    item.imageFileName = source.imageFileName;
    item.image.onload = () => {
      item.image.hidden = false;
      item.imageTextOverlay.textContent = item.descriptionInput.value;
      item.content.classList.add('has-image');
    };
    item.image.src = url;
  }
}
