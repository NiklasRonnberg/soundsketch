export class ObjectClipboard {
  constructor(manager) {
    this.manager = manager;
    this.selected = null;
    this.copied = null;
    this.pasteCount = 0;
    this.bind();
  }

  bind() {
    document.addEventListener('keydown', event => this.onKeyDown(event));
  }

  select(item) {
    this.manager.setSelection([item]);
    this.selected = item;
  }

  isEditingText() {
    return document.activeElement?.matches('input, textarea, [contenteditable="true"]');
  }

  onKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || this.isEditingText()) return;
    const key = event.key.toLowerCase();
    const selected = [...this.manager.selectedItems][0] || this.selected;
    if (key === 'c' && selected) {
      event.preventDefault();
      this.copied = this.snapshot(selected);
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
      y: item.y,
      signalTools: item.signalToolsState ? {
        originalBlob: item.signalToolsState.originalBlob || null,
        active: [...item.signalToolsState.active]
      } : null
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
      // Do not let onAudioReady clear the copied Signal tools state.
      item.signalToolsInternalUpdate = true;
      item.onAudioReady?.();
      item.signalToolsInternalUpdate = false;
    }

    this.restoreSignalTools(source, item);

    if (source.imageUrl) this.copyImage(source, item);
    this.select(item);
    item.titleInput.blur();
  }

  restoreSignalTools(source, item) {
    if (!source.signalTools || !item.signalToolsState) return;

    item.signalToolsState.originalBlob = source.signalTools.originalBlob || source.audioBlob || null;
    item.signalToolsState.active = new Set(source.signalTools.active || []);

    for (const button of item.toolsPane?.querySelectorAll('button') || []) {
      let key = null;
      if (button.dataset.trim) key = `trim-${button.dataset.trim}`;
      else if (button.dataset.reverb) key = `reverb-${button.dataset.reverb}`;
      else if (button.dataset.filter) key = `filter-${button.dataset.filter}`;
      else if (button.dataset.process) key = button.dataset.process;
      if (!key) continue; // -3dB/+3dB are permanent momentary operations.

      const active = item.signalToolsState.active.has(key);
      button.classList.toggle('tool-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
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
