const decoder = new TextDecoder();
function readStoredZip(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x0008) throw new Error('ZIP data descriptors are not supported. Import a Sound Sketch export.');
    if (method !== 0) throw new Error('Compressed ZIP entries are not supported. Import a Sound Sketch export.');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return files;
}
function typeFor(name, fallback) {
  const ext = name.split('.').pop().toLowerCase();
  return ({wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',webm:'audio/webm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'})[ext] || fallback;
}
export class ProjectImporter {
  constructor(button, manager, setTitle) {
    this.button = button; this.manager = manager; this.setTitle = setTitle;
    this.input = document.createElement('input');
    this.input.type = 'file'; this.input.accept = '.zip,application/zip'; this.input.hidden = true;
    document.body.appendChild(this.input);
    button.addEventListener('click', () => { this.input.value = ''; this.input.click(); });
    this.input.addEventListener('change', () => this.importProject(this.input.files[0]));
    const acceptsZip = file => file && (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip');
    button.addEventListener('dragenter', event => {
      event.preventDefault(); event.stopPropagation();
      button.classList.add('zip-drag-over');
    });
    button.addEventListener('dragover', event => {
      event.preventDefault(); event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      button.classList.add('zip-drag-over');
    });
    button.addEventListener('dragleave', event => {
      event.preventDefault(); event.stopPropagation();
      button.classList.remove('zip-drag-over');
    });
    button.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation();
      button.classList.remove('zip-drag-over');
      const file = [...(event.dataTransfer?.files || [])].find(acceptsZip);
      if (file) this.importProject(file);
    });
  }
  async importProject(file) {
    if (!file) return;
    const original = this.button.textContent;
    this.button.disabled = true; this.button.textContent = 'Importing...';
    try {
      const files = readStoredZip(await file.arrayBuffer());
      const manifestBytes = files.get('project.json');
      if (!manifestBytes) throw new Error('Sketch data is missing.');
      const manifest = JSON.parse(decoder.decode(manifestBytes));
      if (manifest.format !== 'sound-sketch-project' || !Array.isArray(manifest.objects)) throw new Error('Not a valid Sound Sketch file.');
      for (const item of [...this.manager.items]) this.manager.remove(item);
      this.setTitle(manifest.projectTitle || 'Untitled sketch');
      for (const record of manifest.objects) {
        const item = this.manager.add({ x: Number(record.x) || 0, y: Number(record.y) || 0, title: record.title || '' });
        item.description = record.annotation || '';
        item.descriptionInput.value = item.description;
        item.imageTextOverlay.textContent = item.description;
        if (record.audioFile && files.has(record.audioFile)) {
          const blob = new Blob([files.get(record.audioFile)], { type: typeFor(record.audioFile, 'audio/webm') });
          item.audioBlob = blob; item.audioUrl = URL.createObjectURL(blob);
          item.audioDuration = Number(record.audioDuration) || 0; item.onAudioReady?.();
        }
        if (record.imageFile && files.has(record.imageFile)) {
          const blob = new Blob([files.get(record.imageFile)], { type: typeFor(record.imageFile, 'image/png') });
          item.imageUrl = URL.createObjectURL(blob); item.imageIsObjectUrl = true;
          item.imageFileName = record.imageOriginalName || record.imageFile.split('/').pop();
          item.image.onload = () => { item.image.hidden = false; item.content.classList.add('has-image'); item.imageTextOverlay.textContent = item.description; };
          item.image.src = item.imageUrl;
        }
        item.titleInput.blur();
      }
      this.manager.updateConnections();
      this.button.textContent = 'Imported';
    } catch (error) {
      console.error(error); this.button.textContent = 'Import failed';
      alert(`Could not import sketch: ${error.message}`);
    } finally {
      setTimeout(() => { this.button.disabled = false; this.button.textContent = original; }, 1400);
    }
  }
}
