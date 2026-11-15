import { CanvasViewport } from './viewport.js';
import { ObjectManager } from './objects.js';
import { AudioRecorder } from './audio.js';
import { SnapEngine } from './snap.js';
import { PlaybackGraph } from './playback.js';
import { SoundSaver } from './save.js';
import { ObjectClipboard } from './object-clipboard.js';
import { ProjectExporter } from './export.js';
import { ProjectImporter } from './import.js';
import { ImageManager } from './images.js';
import { SignalTools } from './signal-tools.js';

const layer = document.querySelector('#objects-layer');
const status = null;
const projectTitle = document.querySelector('#project-title');
if (!projectTitle) throw new Error('Missing #project-title in index.html');
const defaultProjectTitle = 'Untitled sketch';
projectTitle.textContent = defaultProjectTitle;
document.title = 'Sound sketch';

const saveProjectTitle = () => {
  const value = projectTitle.textContent.replace(/\s+/g, ' ').trim() || defaultProjectTitle;
  projectTitle.textContent = value;
  projectTitle.contentEditable = 'false';
  document.title = `${value} - Sound Sketch`;
};
projectTitle.addEventListener('dblclick', event => {
  event.preventDefault(); event.stopPropagation();
  projectTitle.contentEditable = 'true'; projectTitle.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(projectTitle); selection.removeAllRanges(); selection.addRange(range);
});
projectTitle.addEventListener('blur', saveProjectTitle);
projectTitle.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); projectTitle.blur(); }
  if (event.key === 'Escape') { event.preventDefault(); projectTitle.blur(); }
});

const viewport = new CanvasViewport(document.querySelector('#world'), layer);
const recorder = new AudioRecorder(setStatus);
const snap = new SnapEngine();
const playback = new PlaybackGraph(setStatus);
const manager = new ObjectManager(layer, viewport, recorder, snap, playback, setStatus);
new SignalTools(manager);
const images = new ImageManager({
  layer: document.querySelector('#images-layer'), viewport,
  button: document.querySelector('#add-image'), input: document.querySelector('#image-input')
});
new SoundSaver(document.querySelector('#save-sounds'), () => manager.items);
new ObjectClipboard(manager);
new ProjectExporter(document.querySelector('#export-project'), manager, images, () => projectTitle.textContent.trim() || defaultProjectTitle);
new ProjectImporter(document.querySelector('#import-project'), manager, images, value => {
  projectTitle.textContent = value || defaultProjectTitle;
  document.title = `${projectTitle.textContent} - Sound Sketch`;
});
manager.setupMarquee(document.querySelector('#world'));

function setStatus(message) {
  if (message !== 'Enable the microphone before recording.') return;
  document.querySelector('#mic-warning').hidden = false;
}

const infoDialog = document.querySelector('#info-dialog');
const showInfoPage = name => {
  infoDialog.querySelectorAll('[data-info-page]').forEach(button => {
    const active = button.dataset.infoPage === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  infoDialog.querySelectorAll('[data-info-content]').forEach(page => {
    const active = page.dataset.infoContent === name;
    page.hidden = !active;
    page.classList.toggle('active', active);
  });
  infoDialog.querySelector('.info-dialog-content').scrollTop = 0;
};
infoDialog.querySelectorAll('[data-info-page]').forEach(button => {
  button.addEventListener('click', () => showInfoPage(button.dataset.infoPage));
});
document.querySelector('#info-button').addEventListener('click', () => {
  showInfoPage('basics');
  infoDialog.hidden = false;
});
document.querySelector('#info-close').addEventListener('click', () => { infoDialog.hidden = true; });
infoDialog.addEventListener('pointerdown', event => { if (event.target.id === 'info-dialog') infoDialog.hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') infoDialog.hidden = true; });

document.querySelector('#add-object').addEventListener('click', () => manager.add());
const recordModeButton = document.querySelector('#record-mode');
recordModeButton.addEventListener('click', () => {
  const clickMode = manager.recordingMode !== 'click';
  manager.setRecordingMode(clickMode ? 'click' : 'hold');
  recordModeButton.innerHTML = clickMode
    ? '<span class="record-mode-icon dotted-circle" aria-hidden="true"></span>'
    : '<span class="record-mode-icon solid-circle" aria-hidden="true"></span>';
  recordModeButton.title = clickMode ? 'Switch to hold recording' : 'Switch to click recording';
});
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
