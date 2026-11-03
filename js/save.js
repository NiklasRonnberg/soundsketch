export class SoundSaver {
  constructor(button, getItems) {
    this.button = button;
    this.getItems = getItems;
    this.saving = false;
    button.addEventListener('click', () => this.saveAll());
  }

  neighbors(item, items) {
    const width = item.element.offsetWidth;
    const height = item.element.offsetHeight;
    const tolerance = 30;
    return items.filter(other => {
      if (other === item) return false;
      const otherWidth = other.element.offsetWidth;
      const otherHeight = other.element.offsetHeight;
      const verticalOverlap = Math.min(item.y + height, other.y + otherHeight) - Math.max(item.y, other.y) > Math.min(height, otherHeight) * .45;
      const horizontalOverlap = Math.min(item.x + width, other.x + otherWidth) - Math.max(item.x, other.x) > Math.min(width, otherWidth) * .45;
      const horizontalGap = Math.min(Math.abs(item.x + width - other.x), Math.abs(other.x + otherWidth - item.x));
      const verticalGap = Math.min(Math.abs(item.y + height - other.y), Math.abs(other.y + otherHeight - item.y));
      return (verticalOverlap && horizontalGap <= tolerance) || (horizontalOverlap && verticalGap <= tolerance);
    });
  }

  connectedGroups(items) {
    const remaining = new Set(items);
    const groups = [];
    while (remaining.size) {
      const first = remaining.values().next().value;
      const group = [];
      const queue = [first];
      remaining.delete(first);
      while (queue.length) {
        const current = queue.shift();
        group.push(current);
        for (const neighbor of this.neighbors(current, items)) {
          if (!remaining.has(neighbor)) continue;
          remaining.delete(neighbor);
          queue.push(neighbor);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  async decodeItem(item, audioContext) {
    const arrayBuffer = item.audioBlob
      ? await item.audioBlob.arrayBuffer()
      : await (await fetch(item.audioUrl)).arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer.slice(0));
  }

  connectionEdges(items, durationOf) {
    const edges = [], tolerance = 30, added = new Set();
    const addEdge = (a, b, delta, axis) => {
      const key = `${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}:${axis}`;
      if (added.has(key)) return;
      added.add(key);
      edges.push({ a, b, delta, axis });
    };
    for (let i=0; i<items.length; i++) {
      for (let j=i+1; j<items.length; j++) {
        const first=items[i], second=items[j];
        const fw=first.element.offsetWidth, fh=first.element.offsetHeight;
        const sw=second.element.offsetWidth, sh=second.element.offsetHeight;
        const verticalOverlap=Math.min(first.y+fh,second.y+sh)-Math.max(first.y,second.y)>Math.min(fh,sh)*.45;
        const horizontalOverlap=Math.min(first.x+fw,second.x+sw)-Math.max(first.x,second.x)>Math.min(fw,sw)*.20;
        const horizontalGap=Math.min(Math.abs(first.x+fw-second.x),Math.abs(second.x+sw-first.x));
        const verticalGap=Math.min(Math.abs(first.y+fh-second.y),Math.abs(second.y+sh-first.y));
        if (verticalOverlap && horizontalGap<=tolerance) {
          const left=first.x<=second.x?first:second;
          const right=left===first?second:first;
          addEdge(left,right,durationOf(left),'x');
        } else if (horizontalOverlap && verticalGap<=tolerance) {
          const upper=first.y<=second.y?first:second;
          const lower=upper===first?second:first;
          const offset=((lower.x-upper.x)/(upper.element.offsetWidth||1))*durationOf(upper);
          addEdge(upper,lower,offset,'y');
        }
      }
    }
    return edges;
  }
  schedule(group, edges, durationOf) {
    const groupSet=new Set(group);
    const relevant=edges.filter(edge=>groupSet.has(edge.a)&&groupSet.has(edge.b));
    const starts=new Map();
    const root=[...group].sort((a,b)=>a.x-b.x||a.y-b.y)[0];
    starts.set(root,0);
    for (let pass=0; pass<group.length*2; pass++) {
      let changed=false;
      for (const edge of relevant) {
        if (starts.has(edge.a)&&!starts.has(edge.b)) {
          starts.set(edge.b,starts.get(edge.a)+edge.delta); changed=true;
        } else if (!starts.has(edge.a)&&starts.has(edge.b)) {
          starts.set(edge.a,starts.get(edge.b)-edge.delta); changed=true;
        }
      }
      if (!changed) break;
    }
    for (const item of group) if (!starts.has(item)) starts.set(item,0);
    const earliest=Math.min(...starts.values());
    return group.map(item=>({item,start:starts.get(item)-earliest,duration:durationOf(item)}));
  }
  async renderGroup(group, audioContext) {
    const audible=group.filter(item=>item.audioUrl);
    const decoded=await Promise.all(audible.map(async item=>({item,buffer:await this.decodeItem(item,audioContext)})));
    const byItem=new Map(decoded.map(entry=>[entry.item,entry]));
    const durationOf=item=>byItem.get(item)?.buffer.duration||item.audioDuration||0;
    const edges=this.connectionEdges(group,durationOf);
    const scheduled=this.schedule(group,edges,durationOf)
      .map(entry=>({...entry,buffer:byItem.get(entry.item)?.buffer}))
      .filter(entry=>entry.buffer);
    const totalDuration=Math.max(...scheduled.map(entry=>entry.start+entry.buffer.duration),0);
    const sampleRate=44100;
    const frameCount=Math.max(1,Math.ceil(totalDuration*sampleRate));
    const offline=new OfflineAudioContext(2,frameCount,sampleRate);
    for (const entry of scheduled) {
      const simultaneous=scheduled.filter(other=>other.start<entry.start+entry.buffer.duration&&entry.start<other.start+other.buffer.duration).length;
      const source=offline.createBufferSource();
      source.buffer=entry.buffer;
      const gain=offline.createGain();
      gain.gain.value=1/Math.sqrt(Math.max(1,simultaneous));
      source.connect(gain).connect(offline.destination);
      source.start(entry.start);
    }
    return offline.startRendering();
  }
  fileNameFor(group, index) {
    const topLeft = [...group].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const title = topLeft?.titleInput?.value.trim() || `sound-${index + 1}`;
    const safe = title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
    return `${safe || `sound-${index + 1}`}.wav`;
  }

  baseNameFor(group, index) {
    const topLeft = [...group].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const title = topLeft?.titleInput?.value.trim() || `sound-${index + 1}`;
    return title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || `sound-${index + 1}`;
  }

  imageFileName(item) {
    if (!item.imageUrl || item.image?.hidden) return '';
    if (item.imageFileName) return item.imageFileName;
    try {
      const url = new URL(item.imageUrl, window.location.href);
      const candidate = decodeURIComponent(url.pathname.split('/').pop() || '');
      return candidate || 'browser-image';
    } catch {
      return 'image';
    }
  }

  annotationFor(item) {
    const name = item.titleInput?.value.trim() || '';
    const text = item.descriptionInput?.value || item.description || '';
    const imageName = this.imageFileName(item);
    return [name, text, imageName ? `Image: ${imageName}` : ''].filter(Boolean).join('\n');
  }

  annotationTextFor(group) {
    if (group.length === 1) return this.annotationFor(group[0]);
    const columns = new Map();
    for (const item of group) {
      const key = Math.round(item.x / 20);
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push(item);
    }
    const orderedColumns = [...columns.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, items]) => items.sort((a, b) => a.y - b.y || a.x - b.x));
    return orderedColumns.map((column, index) => {
      const parallelAnnotations = column.map(item => this.annotationFor(item));
      return `${index + 1}\n${parallelAnnotations.join('\nMixed with\n')}`;
    }).join('\n\n');
  }

  textBlobFor(group) {
    return new Blob([this.annotationTextFor(group)], { type: 'text/plain;charset=utf-8' });
  }

  audioBufferToWave(buffer) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const samples = buffer.length;
    const bytesPerSample = 2;
    const dataSize = samples * channels * bytesPerSample;
    const output = new ArrayBuffer(44 + dataSize);
    const view = new DataView(output);
    const writeText = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let sample = 0; sample < samples; sample++) {
      for (let channel = 0; channel < channels; channel++) {
        const value = Math.max(-1, Math.min(1, channelData[channel][sample]));
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([output], { type: 'audio/wav' });
  }

  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async saveAll() {
    if (this.saving) return;
    const groups = this.connectedGroups(this.getItems()).filter(group => group.some(item => item.audioUrl));
    if (!groups.length) {
      this.button.textContent = 'No sounds to save';
      setTimeout(() => { this.button.textContent = 'Save sounds'; }, 1400);
      return;
    }
    this.saving = true;
    this.button.disabled = true;
    this.button.textContent = 'Mixing…';
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    try {
      for (let index = 0; index < groups.length; index++) {
        const rendered = await this.renderGroup(groups[index], audioContext);
        const baseName = this.baseNameFor(groups[index], index);
        this.download(this.audioBufferToWave(rendered), `${baseName}.wav`);
        await new Promise(resolve => setTimeout(resolve, 120));
        this.download(this.textBlobFor(groups[index]), `${baseName}.txt`);
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      this.button.textContent = 'Saved';
    } catch (error) {
      console.error(error);
      this.button.textContent = 'Save failed';
    } finally {
      await audioContext.close();
      setTimeout(() => {
        this.saving = false;
        this.button.disabled = false;
        this.button.textContent = 'Save sounds';
      }, 1200);
    }
  }
}
