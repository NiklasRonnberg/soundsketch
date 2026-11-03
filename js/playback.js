export class PlaybackGraph {
  constructor(setStatus) { this.setStatus = setStatus; this.playing = false; }

  connectionEdges(items, durationOf) {
    const edges = [];
    const tolerance = 30;
    const added = new Set();
    const addEdge = (a, b, delta, axis) => {
      const key = `${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}:${axis}`;
      if (added.has(key)) return;
      added.add(key);
      edges.push({ a, b, delta, axis }); // start(b) = start(a) + delta
    };

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const first = items[i], second = items[j];
        const fw = first.element.offsetWidth, fh = first.element.offsetHeight;
        const sw = second.element.offsetWidth, sh = second.element.offsetHeight;
        const verticalOverlap = Math.min(first.y + fh, second.y + sh) - Math.max(first.y, second.y) > Math.min(fh, sh) * .45;
        const horizontalOverlap = Math.min(first.x + fw, second.x + sw) - Math.max(first.x, second.x) > Math.min(fw, sw) * .20;
        const horizontalGap = Math.min(Math.abs(first.x + fw - second.x), Math.abs(second.x + sw - first.x));
        const verticalGap = Math.min(Math.abs(first.y + fh - second.y), Math.abs(second.y + sh - first.y));

        // Left/right objects always form the main sequence. Their timing depends only on the item to the left.
        if (verticalOverlap && horizontalGap <= tolerance) {
          const left = first.x <= second.x ? first : second;
          const right = left === first ? second : first;
          addEdge(left, right, durationOf(left), 'x');
          continue;
        }

        // Above/below objects are timed relative to the upper object. Horizontal displacement is the timing offset.
        if (horizontalOverlap && verticalGap <= tolerance) {
          const upper = first.y <= second.y ? first : second;
          const lower = upper === first ? second : first;
          const width = upper.element.offsetWidth || 1;
          const offset = ((lower.x - upper.x) / width) * durationOf(upper);
          addEdge(upper, lower, offset, 'y');
        }
      }
    }
    return edges;
  }

  connectedFrom(start, items, edges) {
    const adjacent = new Map(items.map(item => [item, []]));
    for (const edge of edges) {
      adjacent.get(edge.a)?.push(edge.b);
      adjacent.get(edge.b)?.push(edge.a);
    }
    const seen = new Set([start]), queue = [start];
    while (queue.length) {
      const current = queue.shift();
      for (const other of adjacent.get(current) || []) {
        if (seen.has(other)) continue;
        seen.add(other); queue.push(other);
      }
    }
    return [...seen];
  }

  schedule(group, edges, durationOf) {
    const groupSet = new Set(group);
    const relevant = edges.filter(edge => groupSet.has(edge.a) && groupSet.has(edge.b));
    const starts = new Map();
    const root = [...group].sort((a,b) => a.x - b.x || a.y - b.y)[0];
    starts.set(root, 0);

    // Solve the relative-time graph in both directions. A vertical branch never changes a horizontal edge.
    for (let pass = 0; pass < group.length * 2; pass++) {
      let changed = false;
      for (const edge of relevant) {
        if (starts.has(edge.a) && !starts.has(edge.b)) {
          starts.set(edge.b, starts.get(edge.a) + edge.delta); changed = true;
        } else if (!starts.has(edge.a) && starts.has(edge.b)) {
          starts.set(edge.a, starts.get(edge.b) - edge.delta); changed = true;
        }
      }
      if (!changed) break;
    }
    for (const item of group) if (!starts.has(item)) starts.set(item, 0);
    const earliest = Math.min(...starts.values());
    return group.map(item => ({ item, start: starts.get(item) - earliest, duration: durationOf(item) }));
  }


  horizontalNeighbors(item, items) {
    const w = item.element.offsetWidth, h = item.element.offsetHeight, tolerance = 30;
    return items.filter(other => {
      if (other === item) return false;
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      const verticalOverlap = Math.min(item.y + h, other.y + oh) - Math.max(item.y, other.y) > Math.min(h, oh) * .45;
      const horizontalGap = Math.min(Math.abs(item.x + w - other.x), Math.abs(other.x + ow - item.x));
      return verticalOverlap && horizontalGap <= tolerance;
    });
  }

  recordingRelation(target, items) {
    const horizontal = this.horizontalNeighbors(target, items);
    const left = horizontal.filter(item => item.x < target.x).sort((a,b) => b.x - a.x)[0] || null;
    const right = horizontal.filter(item => item.x > target.x).sort((a,b) => a.x - b.x)[0] || null;
    if (left) return { mode: 'after-left', anchor: left };
    if (right) return { mode: 'before-right', anchor: right };
    return { mode: 'simultaneous', anchor: null };
  }

  connectedExisting(target, items) {
    const durationOf = item => item.audioDuration || 0;
    const edges = this.connectionEdges(items, durationOf);
    return this.connectedFrom(target, items, edges).filter(item => item !== target && item.audioUrl);
  }

  async playBeforeRecording(target, items) {
    const relation = this.recordingRelation(target, items);
    if (relation.mode !== 'after-left') return;
    // Follow only the horizontal sequence ending immediately to the left of the recording object.
    const sequence = [];
    let current = relation.anchor;
    while (current) {
      sequence.unshift(current);
      current = this.horizontalNeighbors(current, items)
        .filter(item => item.x < current.x && item.audioUrl)
        .sort((a,b) => b.x - a.x)[0] || null;
    }
    for (const item of sequence) await this.playOne(item);
  }

  async playSimultaneousWithRecording(target, items) {
    const sounds = this.connectedExisting(target, items);
    await Promise.all(sounds.map(item => this.playOne(item)));
  }

  async playAfterRecording(target, items) {
    const relation = this.recordingRelation(target, items);
    if (relation.mode !== 'before-right') return;
    const sequence = [];
    let current = relation.anchor;
    while (current) {
      if (current.audioUrl) sequence.push(current);
      current = this.horizontalNeighbors(current, items)
        .filter(item => item.x > current.x)
        .sort((a,b) => a.x - b.x)[0] || null;
    }
    for (const item of sequence) await this.playOne(item);
  }

  async playFrom(start, items) {
    if (this.playing) return;
    this.playing = true;
    try {
      const durationOf = item => item.audioDuration || 0;
      const edges = this.connectionEdges(items, durationOf);
      const group = this.connectedFrom(start, items, edges);
      const scheduled = this.schedule(group, edges, durationOf);
      await Promise.all(scheduled.map(({item, start}) => new Promise(resolve => {
        setTimeout(() => this.playOne(item).then(resolve), Math.max(0, start * 1000));
      })));
    } finally { this.playing = false; }
  }

  playOne(item) {
    return new Promise(resolve => {
      if (!item.audioUrl) { resolve(); return; }
      const button = item.recordButton;
      const audio = new Audio(item.audioUrl);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        button?.classList.remove('playing-now');
        button?.removeAttribute('aria-pressed');
        if (item.activeAudio === audio) item.activeAudio = null;
        resolve();
      };
      item.activeAudio = audio;
      button?.classList.add('playing-now');
      button?.setAttribute('aria-pressed', 'true');
      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      audio.addEventListener('abort', finish, { once: true });
      audio.play().catch(finish);
    });
  }
}
