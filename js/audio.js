export class AudioRecorder {
  constructor(setStatus) {
    this.stream = null;
    this.setStatus = setStatus;
    this.context = null;
  }
  async requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus('Microphone access is not supported here. Open the page via localhost or HTTPS in a modern browser.');
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.setStatus('The microphone is ready. Hold the record button to record.');
      return true;
    } catch (err) {
      this.setStatus('Microphone access was denied or could not be started. Check your browser permissions.');
      return false;
    }
  }
  async start(item) {
    if (!this.stream || !this.stream.active) {
      this.setStatus('Enable the microphone before recording.');
      return false;
    }
    if (!window.MediaRecorder) {
      this.setStatus('This browser does not support audio recording with MediaRecorder.');
      return false;
    }
    try {
      const chunks = [];
      const recorder = new MediaRecorder(this.stream);
      item.recorder = recorder;
      item.recordChunks = chunks;
      recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
      recorder.addEventListener('stop', () => {
        if (!chunks.length) { item.audioUrl = null; item.audioBlob = null; return; }
        item.audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
        item.audioUrl = URL.createObjectURL(item.audioBlob);
        item.audioDuration = Math.max(0, (Date.now() - item.recordStarted) / 1000);
        item.onAudioReady?.();
      });
      item.recordStarted = Date.now();
      recorder.start();
      return true;
    } catch (err) {
      this.setStatus('Recording could not be started.');
      return false;
    }
  }
  stop(item) {
    if (item.recorder && item.recorder.state === 'recording') item.recorder.stop();
  }
  async play(item) {
    if (!item.audioUrl) return;
    const audio = new Audio(item.audioUrl);
    item.activeAudio = audio;
    try { await audio.play(); }
    catch { this.setStatus('Playback could not be started. Try clicking again.'); }
    return audio;
  }
}
