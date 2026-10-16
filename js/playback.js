export class PlaybackGraph {
  constructor(setStatus) { this.setStatus = setStatus; this.playing = false; }
  neighbors(item, items) {
    const w = item.element.offsetWidth, h = item.element.offsetHeight, tol = 30;
    const result = [];
    for (const other of items) {
      if (other === item) continue;
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      const verticalOverlap = Math.min(item.y+h, other.y+oh) - Math.max(item.y, other.y) > Math.min(h,oh)*.45;
      const horizontalOverlap = Math.min(item.x+w, other.x+ow) - Math.max(item.x, other.x) > Math.min(w,ow)*.45;
      const horizontalGap = Math.min(Math.abs((item.x+w)-other.x), Math.abs((other.x+ow)-item.x));
      const verticalGap = Math.min(Math.abs((item.y+h)-other.y), Math.abs((other.y+oh)-item.y));
      if (verticalOverlap && horizontalGap <= tol) result.push({ item: other, axis: 'x' });
      else if (horizontalOverlap && verticalGap <= tol) result.push({ item: other, axis: 'y' });
    }
    return result;
  }
  async playFrom(start, items) {
    if (this.playing) return;
    this.playing = true;
    try {
      // Collect connected neighbors; each horizontal row plays left-to-right, rows/columns vertically together.
      const graph = new Map();
      for (const item of items) graph.set(item, this.neighbors(item, items));
      const seen = new Set([start]), queue = [start];
      while (queue.length) {
        const cur = queue.shift();
        for (const edge of graph.get(cur) || []) if (!seen.has(edge.item)) { seen.add(edge.item); queue.push(edge.item); }
      }
      const group = [...seen];
      const columns = new Map();
      for (const item of group) {
        const col = Math.round(item.x / 20);
        if (!columns.has(col)) columns.set(col, []);
        columns.get(col).push(item);
      }
      const orderedColumns = [...columns.entries()].sort((a,b) => a[0]-b[0]);
      for (const [, column] of orderedColumns) {
        const promises = column.map(item => this.playOne(item));
        await Promise.all(promises);
      }
    } finally { this.playing = false; }
  }
  playOne(item) {
    return new Promise(resolve => {
      if (!item.audioUrl) { resolve(); return; }
      const audio = new Audio(item.audioUrl);
      item.activeAudio = audio;
      audio.addEventListener('ended', resolve, { once: true });
      audio.addEventListener('error', resolve, { once: true });
      audio.play().catch(() => resolve());
    });
  }
}
