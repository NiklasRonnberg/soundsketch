const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value, true); }
function safeName(value, fallback) {
  return (value || fallback).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || fallback;
}
async function bytesFrom(blob) { return new Uint8Array(await blob.arrayBuffer()); }

function buildStoredZip(entries) {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    u32(lv,0,0x04034b50); u16(lv,4,20); u16(lv,6,0x0800); u16(lv,8,0);
    u16(lv,10,0); u16(lv,12,0); u32(lv,14,crc); u32(lv,18,data.length); u32(lv,22,data.length);
    u16(lv,26,name.length); u16(lv,28,0);
    local.set(name,30); local.set(data,30+name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv,0,0x02014b50); u16(cv,4,20); u16(cv,6,20); u16(cv,8,0x0800); u16(cv,10,0);
    u16(cv,12,0); u16(cv,14,0); u32(cv,16,crc); u32(cv,20,data.length); u32(cv,24,data.length);
    u16(cv,28,name.length); u16(cv,30,0); u16(cv,32,0); u16(cv,34,0); u16(cv,36,0);
    u32(cv,38,0); u32(cv,42,offset); central.set(name,46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  u32(ev,0,0x06054b50); u16(ev,4,0); u16(ev,6,0); u16(ev,8,entries.length); u16(ev,10,entries.length);
  u32(ev,12,centralSize); u32(ev,16,offset); u16(ev,20,0);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

export class ProjectExporter {
  constructor(button, manager, getTitle) {
    this.button = button; this.manager = manager; this.getTitle = getTitle;
    button.addEventListener('click', () => this.exportProject());
  }
  async blobForUrl(url) {
    if (!url) return null;
    try { return await fetch(url).then(response => response.blob()); } catch { return null; }
  }
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async exportProject() {
    const original = this.button.textContent;
    this.button.disabled = true; this.button.textContent = 'Exporting...';
    try {
      const entries = [];
      const manifest = { format: 'sound-sketch-project', version: 1, projectTitle: this.getTitle(), objects: [] };
      for (let index = 0; index < this.manager.items.length; index++) {
        const item = this.manager.items[index];
        const record = {
          title: item.titleInput.value,
          annotation: item.descriptionInput.value,
          x: item.x, y: item.y,
          audioDuration: item.audioDuration || 0,
          audioFile: null, imageFile: null, imageOriginalName: item.imageFileName || ''
        };
        if (item.audioBlob || item.audioUrl) {
          const blob = item.audioBlob || await this.blobForUrl(item.audioUrl);
          if (blob) {
            const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'webm';
            record.audioFile = `audio/object-${index + 1}.${ext}`;
            entries.push({ name: record.audioFile, data: await bytesFrom(blob) });
          }
        }
        if (item.imageUrl && !item.image.hidden) {
          const blob = await this.blobForUrl(item.imageUrl);
          if (blob) {
            const originalName = safeName(item.imageFileName, `image-${index + 1}`);
            const ext = originalName.includes('.') ? originalName.split('.').pop() : (blob.type.split('/')[1] || 'png');
            record.imageFile = `images/object-${index + 1}.${ext}`;
            entries.push({ name: record.imageFile, data: await bytesFrom(blob) });
          }
        }
        manifest.objects.push(record);
      }
      entries.unshift({ name: 'project.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) });
      this.download(buildStoredZip(entries), `${safeName(manifest.projectTitle, 'sound-sketch-project')}.zip`);
      this.button.textContent = 'Exported';
    } catch (error) {
      console.error(error); this.button.textContent = 'Export failed';
    } finally {
      setTimeout(() => { this.button.disabled = false; this.button.textContent = original; }, 1200);
    }
  }
}
