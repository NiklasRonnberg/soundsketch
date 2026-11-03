export class SnapEngine {
  constructor() { this.gap = 12; this.threshold = 34; }
  resolve(item, items) {
    const w = item.element.offsetWidth, h = item.element.offsetHeight;
    const others = items.filter(other => other !== item);
    let x = item.x, y = item.y;
    const intersects = (px, py, other) => {
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      return px < other.x + ow && px + w > other.x && py < other.y + oh && py + h > other.y;
    };
    const candidates = [];
    for (const other of others) {
      const ow = other.element.offsetWidth, oh = other.element.offsetHeight;
      // Normal left/right snapping remains exactly as before.
      candidates.push(
        { x: other.x - w - this.gap, y: other.y, axis: 'x' },
        { x: other.x + ow + this.gap, y: other.y, axis: 'x' }
      );
      // Only top/bottom snapping gets timing offsets. Zero is 100% overlap.
      // +/-25%, +/-50%, and +/-75% of the object width give 75%, 50%, and 25% overlap.
      for (const fraction of [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]) {
        candidates.push(
          { x: other.x + ow * fraction, y: other.y - h - this.gap, axis: 'y', fraction, other },
          { x: other.x + ow * fraction, y: other.y + oh + this.gap, axis: 'y', fraction, other }
        );
      }
    }
    for (const candidate of candidates) candidate.d = Math.hypot(x - candidate.x, y - candidate.y);
    const snapped = candidates.filter(candidate => candidate.d <= this.threshold).sort((a,b) => a.d-b.d)[0];
    item.verticalSnap = null;
    if (snapped) {
      x = snapped.x; y = snapped.y;
      if (snapped.axis === 'y') item.verticalSnap = { otherId: snapped.other.id, fraction: snapped.fraction };
    }
    // Keep the original collision prevention, except vertically snapped sound objects are intentionally allowed
    // to share their horizontal range because they are separated vertically by the snap gap.
    for (let pass=0; pass<others.length+2; pass++) {
      const collision = others.find(other => intersects(x,y,other));
      if (!collision) break;
      const ow = collision.element.offsetWidth, oh = collision.element.offsetHeight;
      const positions = [
        { x: collision.x-w-this.gap, y: collision.y },
        { x: collision.x+ow+this.gap, y: collision.y },
        { x: collision.x, y: collision.y-h-this.gap },
        { x: collision.x, y: collision.y+oh+this.gap }
      ].map(position => ({...position, d: Math.hypot(x-position.x,y-position.y), blocked: others.some(other => other!==collision && intersects(position.x,position.y,other))}))
       .sort((a,b) => Number(a.blocked)-Number(b.blocked) || a.d-b.d);
      x=positions[0].x; y=positions[0].y;
    }
    return {x,y};
  }
}
