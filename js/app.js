import { CanvasViewport } from './viewport.js';
import { ObjectManager } from './objects.js';
import { AudioRecorder } from './audio.js';
import { SnapEngine } from './snap.js';
import { PlaybackGraph } from './playback.js';
import { SoundSaver } from './save.js';
import { ObjectClipboard } from './object-clipboard.js';
const layer = document.querySelector('#objects-layer');
const status = null;
const viewport = new CanvasViewport(document.querySelector('#world'), layer);
const recorder = new AudioRecorder(setStatus);
const snap = new SnapEngine();
const playback = new PlaybackGraph(setStatus);
const manager = new ObjectManager(layer, viewport, recorder, snap, playback, setStatus);
new SoundSaver(document.querySelector('#save-sounds'), () => manager.items);
new ObjectClipboard(manager);
document.querySelector('#world').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  if (event.target.closest('.sound-object, .toolbar, .save-button, .mic-warning')) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  for (const item of manager.items) {
    item.element.classList.remove('selected');
    item.content.classList.remove('editing-annotation');
    item.description = item.descriptionInput.value;
    item.imageTextOverlay.textContent = item.description;
  }
});
function setStatus(message) {
  if (message !== 'Enable the microphone before recording.') return;
  document.querySelector('#mic-warning').hidden = false;
}
document.querySelector('#info-button').addEventListener('click', () => { document.querySelector('#info-dialog').hidden = false; });
document.querySelector('#info-close').addEventListener('click', () => { document.querySelector('#info-dialog').hidden = true; });
document.querySelector('#info-dialog').addEventListener('pointerdown', event => { if (event.target.id === 'info-dialog') document.querySelector('#info-dialog').hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('#info-dialog').hidden = true; });
document.querySelector('#add-object').addEventListener('click', () => manager.add());
document.querySelector('#mic-permission').addEventListener('click', async () => {
  const ok = await recorder.requestPermission();
  const button = document.querySelector('#mic-permission');
  button.classList.toggle('ready', ok);
  button.textContent = ok ? 'Microphone enabled' : 'Enable microphone';
});
document.querySelector('#mic-warning-close').addEventListener('click', () => {
  document.querySelector('#mic-warning').hidden = true;
});
document.querySelector('#mic-warning-enable').addEventListener('click', async () => {
  const ok = await recorder.requestPermission();
  const button = document.querySelector('#mic-permission');
  button.classList.toggle('ready', ok);
  button.textContent = ok ? 'Microphone enabled' : 'Enable microphone';
  if (ok) document.querySelector('#mic-warning').hidden = true;
});
viewport.onTransform = () => manager.refreshScale();
manager.add({ x: 90, y: 100 });
