// Adjust these two values while testing the trim behavior.
const TRIM_THRESHOLD = 0.01;
const TRIM_WINDOW_SIZE = 10000;

export class SignalTools {
  constructor(manager) {
    this.manager = manager;
    const originalAdd = manager.add.bind(manager);
    manager.add = options => {
      const item = originalAdd(options);
      this.attach(item);
      return item;
    };
    for (const item of manager.items) this.attach(item);
  }

  attach(item) {
    if (item.toolsPane) return;
    const pane = document.createElement('div');
    pane.className = 'sound-tools-pane';
    pane.hidden = true;
    pane.innerHTML = `
      <div class="sound-tools-heading">Signal tools</div>
      <button type="button" data-gain="-3">-3dB</button>
      <button type="button" data-gain="3">+3dB</button>
      <button type="button" data-trim="start">Trim start</button>
      <button type="button" data-trim="end">Trim end</button>
      <button type="button" data-process="reverse">Reverse</button>
      <button type="button" data-process="random">Random</button>
      <div class="reverb-tools-row">
        <button type="button" data-reverb="room">Room</button>
        <button type="button" data-reverb="hall">Hall</button>
        <button type="button" data-reverb="church">Church</button>
      </div>
      <button type="button" data-process="robot">Robot</button>
      <button type="button" data-process="metal">Metal</button>        <div class="filter-tools-row">
          <button type="button" data-filter="lpf">LPF</button>
          <button type="button" data-filter="bpf">BPF</button>
          <button type="button" data-filter="hpf">HPF</button>
        </div>
`;
    item.toolsPane = pane;
    item.element.appendChild(pane);
    item.signalToolsState = { originalBlob: null, active: new Set(), rebuilding: false };
    const originalOnAudioReady = item.onAudioReady;
    item.onAudioReady = () => {
      originalOnAudioReady?.();
      if (item.signalToolsInternalUpdate) return;
      this.resetForNewSource(item);
    };

    let closeTimer = null;

    const openPane = () => {
      clearTimeout(closeTimer);
      pane.hidden = false;
      pane.classList.remove('closing');
      item.element.classList.add('tools-open');
      item.element.classList.remove('tools-closing');
      pane.getBoundingClientRect();
      requestAnimationFrame(() => pane.classList.add('open'));
    };

    const closePane = () => {
      if (pane.hidden || pane.classList.contains('closing')) return;
      pane.classList.remove('open');
      pane.classList.add('closing');
      item.element.classList.remove('tools-open');
      item.element.classList.add('tools-closing');
      closeTimer = setTimeout(() => {
        pane.hidden = true;
        pane.classList.remove('closing');
        item.element.classList.remove('tools-closing');
      }, 230);
    };

    item.element.addEventListener('dblclick', event => {
      if (event.target.closest('input, textarea, button, .object-content, .sound-tools-pane')) return;
      event.preventDefault();
      event.stopPropagation();
      if (!pane.hidden && pane.classList.contains('open')) {
        closePane();
        return;
      }
      this.manager.playback.stopAll(this.manager.items);
      openPane();
    });

    pane.addEventListener('pointerdown', event => event.stopPropagation());

    pane.addEventListener('dblclick', event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      event.stopPropagation();
      closePane();
    });

    pane.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.gain) {
          this.showMomentaryFeedback(button);
          await this.applyPermanentGain(item, Number(button.dataset.gain));
          return;
        }
        const key = this.effectKey(button);
        if (!key) return;
        if (item.signalToolsState.active.has(key)) {
          item.signalToolsState.active.delete(key);
          button.classList.remove('tool-active');
          button.setAttribute('aria-pressed', 'false');
        } else {
          item.signalToolsState.active.add(key);
          button.classList.add('tool-active');
          button.setAttribute('aria-pressed', 'true');
        }
        await this.rebuildActiveEffects(item);
      });
    });
  }

  effectKey(button) {
    if (button.dataset.trim) return `trim-${button.dataset.trim}`;
    if (button.dataset.reverb) return `reverb-${button.dataset.reverb}`;
    if (button.dataset.filter) return `filter-${button.dataset.filter}`;
    if (button.dataset.process) return button.dataset.process;
    return null;
  }

  showMomentaryFeedback(button) {
    clearTimeout(button.feedbackTimer);
    button.classList.add('tool-momentary');
    button.feedbackTimer = setTimeout(() => button.classList.remove('tool-momentary'), 250);
  }

  async ensureOriginalBlob(item) {
    if (item.signalToolsState.originalBlob) return item.signalToolsState.originalBlob;
    const blob = item.audioBlob || (item.audioUrl ? await fetch(item.audioUrl).then(r => r.blob()) : null);
    if (blob) item.signalToolsState.originalBlob = blob;
    return blob;
  }

  resetForNewSource(item) {
    const state = item.signalToolsState;
    if (!state || state.rebuilding) return;
    state.originalBlob = item.audioBlob || null;
    state.active.clear();
    item.toolsPane?.querySelectorAll('button.tool-active').forEach(button => {
      button.classList.remove('tool-active');
      button.setAttribute('aria-pressed', 'false');
    });
  }

  async applyPermanentGain(item, gainDb) {
    if (item.processingGain) return;
    const originalBlob = await this.ensureOriginalBlob(item);
    if (!originalBlob) return;
    item.processingGain = true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(await originalBlob.arrayBuffer());
      await context.close();
      item.signalToolsState.originalBlob = this.toWave(buffer, Math.pow(10, gainDb / 20));
    } finally { item.processingGain = false; }
    await this.rebuildActiveEffects(item);
  }

  async updateDisplayedDuration(item) {
    const blob = item.audioBlob || (item.audioUrl
      ? await fetch(item.audioUrl).then(response => response.blob())
      : null);
    if (!blob) {
      item.audioDuration = 0;
      item.meta.textContent = '';
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      item.audioDuration = buffer.length / buffer.sampleRate;
      item.meta.textContent = `Audio · ${item.audioDuration.toFixed(1)} s`;
    } finally {
      await context.close();
    }
  }

  async rebuildActiveEffects(item) {
    const state = item.signalToolsState;
    if (!state || state.rebuilding) return;
    const originalBlob = await this.ensureOriginalBlob(item);
    if (!originalBlob) return;
    state.rebuilding = true;
    this.manager.playback.stopAll(this.manager.items);
    try {
      if (item.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(item.audioUrl);
      item.audioBlob = originalBlob;
      item.audioUrl = URL.createObjectURL(originalBlob);
      item.signalToolsInternalUpdate = true;
      const order = ['trim-start','trim-end','reverse','random','reverb-room','reverb-hall','reverb-church','robot','metal','filter-lpf','filter-bpf','filter-hpf'];
      for (const key of order) {
        if (!state.active.has(key)) continue;
        if (key === 'trim-start') await this.applyTrim(item, 'start');
        else if (key === 'trim-end') await this.applyTrim(item, 'end');
        else if (key === 'reverse') await this.applyReverse(item);
        else if (key === 'random') await this.applyRandom(item);
        else if (key.startsWith('reverb-')) await this.applyReverb(item, key.slice(7));
        else if (key === 'robot') await this.applyRobot(item);
        else if (key === 'metal') await this.applyMetal(item);
        else if (key.startsWith('filter-')) await this.applyFilter(item, key.slice(7));
      }
      await this.updateDisplayedDuration(item);
      item.signalToolsInternalUpdate = false;
      item.onAudioReady?.();
      this.manager.updateConnections();
    } finally {
      item.signalToolsInternalUpdate = false;
      state.rebuilding = false;
    }
  }

  async applyGain(item, gainDb) {
    if ((!item.audioBlob && !item.audioUrl) || item.processingGain) return;
    item.processingGain = true;
    try {
      const sourceBlob = item.audioBlob || await fetch(item.audioUrl).then(response => response.blob());
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(await sourceBlob.arrayBuffer());
      await context.close();
      const multiplier = Math.pow(10, gainDb / 20);
      const wavBlob = this.toWave(buffer, multiplier);
      if (item.activeAudio) {
        item.activeAudio.pause();
        item.activeAudio = null;
      }
      if (item.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(item.audioUrl);
      item.audioBlob = wavBlob;
      item.audioUrl = URL.createObjectURL(wavBlob);
      item.audioDuration = buffer.duration;
      item.onAudioReady?.();
    } catch (error) {
      console.error('Could not apply gain.', error);
    } finally {
      item.processingGain = false;
    }
  }

  async applyReverse(item) {
    await this.rewriteAudio(item, buffer => {
      const channels = Math.min(2, buffer.numberOfChannels);
      const output = Array.from({ length: channels }, () => new Float32Array(buffer.length));
      for (let channel = 0; channel < channels; channel++) {
        const source = buffer.getChannelData(channel);
        for (let sample = 0; sample < buffer.length; sample++) {
          output[channel][sample] = source[buffer.length - 1 - sample];
        }
      }
      return output;
    });
  }

  async applyRandom(item) {
    await this.rewriteAudio(item, buffer => {
      const channels = Math.min(2, buffer.numberOfChannels);
      const windowSize = Math.max(1, (TRIM_WINDOW_SIZE / 2));
      const fadeSamples = 12;
      const windows = [];
      for (let start = 0; start < buffer.length; start += windowSize) {
        windows.push({ start, end: Math.min(start + windowSize, buffer.length) });
      }
      // Shuffle complete/partial windows, while keeping every window internally unchanged.
      for (let index = windows.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [windows[index], windows[other]] = [windows[other], windows[index]];
      }
      const output = Array.from({ length: channels }, () => new Float32Array(buffer.length));
      let destination = 0;
      for (const window of windows) {
        const size = window.end - window.start;
        const edgeFade = Math.min(fadeSamples, Math.floor(size / 2));
        for (let channel = 0; channel < channels; channel++) {
          const source = buffer.getChannelData(channel);
          for (let sample = 0; sample < size; sample++) {
            let gain = 1;
            if (edgeFade > 0 && sample < edgeFade) {
              gain = sample / edgeFade;
            }
            if (edgeFade > 0 && sample >= size - edgeFade) {
              gain = Math.min(gain, (size - 1 - sample) / edgeFade);
            }
            output[channel][destination + sample] = source[window.start + sample] * Math.max(0, gain);
          }
        }
        destination += size;
      }
      return output;
    });
  }

  async applyRobot(item) {
    const frequency = 440;
    await this.rewriteAudio(item, buffer => {
      const channels = Math.min(2, buffer.numberOfChannels);
      const output = Array.from({ length: channels }, () => new Float32Array(buffer.length));
      const phaseStep = 2 * Math.PI * frequency / buffer.sampleRate;

      for (let channel = 0; channel < channels; channel++) {
        const source = buffer.getChannelData(channel);
        for (let sample = 0; sample < buffer.length; sample++) {
          const phase = (sample * frequency / buffer.sampleRate) % 1;
          const triangle = 1 - 4 * Math.abs(phase - 0.5);
          output[channel][sample] = source[sample] * triangle;
        }
      }
      return output;
    });
  }

  async applyMetal(item) {
    const frequencies = [600, 938.5, 1370.5];
    const noiseAmount = 0.35;
    const toneAmount = 0.65;

    await this.rewriteAudio(item, buffer => {
      const channels = Math.min(2, buffer.numberOfChannels);
      const output = Array.from({ length: channels }, () => new Float32Array(buffer.length));
      // Build one shared high-frequency/noise modulator so stereo channels stay coherent.
      const modulator = new Float32Array(buffer.length);
      let previousNoise = 0;
      for (let sample = 0; sample < buffer.length; sample++) {
        let tones = 0;
        for (const frequency of frequencies) {
          const phase = (sample * frequency / buffer.sampleRate) % 1;
          const triangle = 1 - 4 * Math.abs(phase - 0.5);
          tones += triangle;
        }
        tones /= frequencies.length;

        // High-pass-like noise emphasises fast, bright changes instead of low rumble.
        const whiteNoise = Math.random() * 2 - 1;
        const brightNoise = whiteNoise - previousNoise * 0.82;
        previousNoise = whiteNoise;

        modulator[sample] = Math.max(-1, Math.min(1,
          toneAmount * tones + noiseAmount * brightNoise
        ));
      }

      for (let channel = 0; channel < channels; channel++) {
        const source = buffer.getChannelData(channel);
        for (let sample = 0; sample < buffer.length; sample++) {
          const wet = source[sample] * modulator[sample];
          output[channel][sample] = 0.25 * source[sample] + wet;
        }
      }
      return output;
    });
  }

  async applyFilter(item, type) {
    const settings = {
      lpf: { frequency: 500, q: Math.SQRT1_2 },
      bpf: { frequency: 1000, q: 1 },
      hpf: { frequency: 2500, q: Math.SQRT1_2 }
    };
    const setting = settings[type];
    if (!setting) return;
    await this.rewriteAudio(item, buffer => {
      const channels = Math.min(2, buffer.numberOfChannels);
      const output = [];
      for (let channel = 0; channel < channels; channel++) {
        output.push(this.processBiquad(buffer.getChannelData(channel), buffer.sampleRate, type, setting.frequency, setting.q));
      }
      return output;
    });
  }

  processBiquad(input, sampleRate, type, frequency, q) {
    const output = new Float32Array(input.length);
    const omega = 2 * Math.PI * Math.min(frequency, sampleRate * 0.49) / sampleRate;
    const cos = Math.cos(omega), sin = Math.sin(omega), alpha = sin / (2 * q);
    let b0, b1, b2;
    if (type === 'lpf') { b0=(1-cos)/2; b1=1-cos; b2=(1-cos)/2; }
    else if (type === 'hpf') { b0=(1+cos)/2; b1=-(1+cos); b2=(1+cos)/2; }
    else { b0=alpha; b1=0; b2=-alpha; }
    const a0=1+alpha, a1=-2*cos, a2=1-alpha;
    b0/=a0; b1/=a0; b2/=a0;
    const A1=a1/a0, A2=a2/a0;
    let x1=0,x2=0,y1=0,y2=0;
    for(let i=0;i<input.length;i++){
      const x0=input[i];
      const y0=b0*x0+b1*x1+b2*x2-A1*y1-A2*y2;
      output[i]=y0; x2=x1; x1=x0; y2=y1; y1=y0;
    }
    return output;
  }

  async applyReverb(item, size) {
    const profiles = {
      room: {
        combDelays: [0.0297, 0.0371, 0.0411, 0.0437],
        combFeedback: [0.72, 0.70, 0.68, 0.66],
        allpassDelays: [0.0050, 0.0017, 0.0006],
        allpassGain: 0.70,
        damping: 0.32,
        preDelay: 0.008,
        tailSeconds: 0.9
      },
      hall: {
        combDelays: [0.0437, 0.0511, 0.0571, 0.0617],
        combFeedback: [0.80, 0.78, 0.76, 0.74],
        allpassDelays: [0.0091, 0.0037, 0.0013],
        allpassGain: 0.72,
        damping: 0.42,
        preDelay: 0.022,
        tailSeconds: 2.4
      },
      church: {
        combDelays: [0.0677, 0.0799, 0.0893, 0.1013],
        combFeedback: [0.87, 0.85, 0.83, 0.81],
        allpassDelays: [0.0143, 0.0061, 0.0023],
        allpassGain: 0.74,
        damping: 0.50,
        preDelay: 0.045,
        tailSeconds: 4.8
      }
    };

    const profile = profiles[size];
    if (!profile) return;

    await this.rewriteAudio(item, buffer => {
      const channelCount = Math.min(2, buffer.numberOfChannels);
      const tailSamples = Math.ceil(profile.tailSeconds * buffer.sampleRate);
      const outputLength = buffer.length + tailSamples;
      const preDelaySamples = Math.round(profile.preDelay * buffer.sampleRate);
      const output = [];

      for (let channel = 0; channel < channelCount; channel++) {
        const dry = new Float32Array(outputLength);
        dry.set(buffer.getChannelData(channel));

        const reverbInput = new Float32Array(outputLength);
        reverbInput.set(buffer.getChannelData(channel), preDelaySamples);

        // Schroeder reverberator: parallel damped comb filters create the decay,
        // followed by three series all-pass filters to increase echo density.
        const wet = new Float32Array(outputLength);
        for (let filter = 0; filter < profile.combDelays.length; filter++) {
          const comb = this.processDampedComb(
            reverbInput,
            Math.max(1, Math.round(profile.combDelays[filter] * buffer.sampleRate)),
            profile.combFeedback[filter],
            profile.damping
          );
          for (let sample = 0; sample < outputLength; sample++) {
            wet[sample] += comb[sample] / profile.combDelays.length;
          }
        }

        let diffused = wet;
        for (const delay of profile.allpassDelays) {
          diffused = this.processAllpass(
            diffused,
            Math.max(1, Math.round(delay * buffer.sampleRate)),
            profile.allpassGain
          );
        }

        const mixed = new Float32Array(outputLength);
        for (let sample = 0; sample < outputLength; sample++) {
          // 100% dry plus 50% wet, with soft limiting to avoid hard clipping.
          const value = dry[sample] + 0.5 * diffused[sample];
          mixed[sample] = Math.tanh(value);
        }
        output.push(mixed);
      }
      return output;
    });
  }

  processDampedComb(input, delaySamples, feedback, damping) {
    const output = new Float32Array(input.length);
    let lowpassState = 0;
    for (let sample = 0; sample < input.length; sample++) {
      const delayed = sample >= delaySamples ? output[sample - delaySamples] : 0;
      lowpassState = delayed * (1 - damping) + lowpassState * damping;
      output[sample] = input[sample] + feedback * lowpassState;
    }
    return output;
  }

  processAllpass(input, delaySamples, gain) {
    const output = new Float32Array(input.length);
    for (let sample = 0; sample < input.length; sample++) {
      const delayedInput = sample >= delaySamples ? input[sample - delaySamples] : 0;
      const delayedOutput = sample >= delaySamples ? output[sample - delaySamples] : 0;
      output[sample] = -gain * input[sample] + delayedInput + gain * delayedOutput;
    }
    return output;
  }

  async rewriteAudio(item, transform) {
    if ((!item.audioBlob && !item.audioUrl) || item.processingGain) return;
    item.processingGain = true;
    try {
      const sourceBlob = item.audioBlob || await fetch(item.audioUrl).then(response => response.blob());
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(await sourceBlob.arrayBuffer());
      await context.close();
      const channels = transform(buffer);
      const wavBlob = this.channelsToWave(channels, buffer.sampleRate);
      if (item.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(item.audioUrl);
      item.audioBlob = wavBlob;
      item.audioUrl = URL.createObjectURL(wavBlob);
      item.audioDuration = channels[0].length / buffer.sampleRate;
      item.onAudioReady?.();
    } catch (error) {
      console.error('Could not process audio.', error);
    } finally {
      item.processingGain = false;
    }
  }

  channelsToWave(channelData, sampleRate) {
    const channels = channelData.length;
    const samples = channelData[0]?.length || 0;
    const dataSize = samples * channels * 2;
    const output = new ArrayBuffer(44 + dataSize);
    const view = new DataView(output);
    const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, dataSize, true);
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

  async applyTrim(item, edge) {
    if ((!item.audioBlob && !item.audioUrl) || item.processingGain) return;
    item.processingGain = true;

    try {
      const sourceBlob = item.audioBlob || await fetch(item.audioUrl).then(response => response.blob());
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(await sourceBlob.arrayBuffer());
      await context.close();

      const range = this.findTrimRange(buffer, edge);
      if (!range || range.end <= range.start) return;

      const wavBlob = this.toWave(buffer, 1, range.start, range.end);
      if (item.activeAudio) {
        item.activeAudio.pause();
        item.activeAudio = null;
      }
      if (item.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(item.audioUrl);

      item.audioBlob = wavBlob;
      item.audioUrl = URL.createObjectURL(wavBlob);
      item.audioDuration = (range.end - range.start) / buffer.sampleRate;
      item.onAudioReady?.();
    } catch (error) {
      console.error('Could not trim audio.', error);
    } finally {
      item.processingGain = false;
    }
  }

  findTrimRange(buffer, edge) {
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, channel) => buffer.getChannelData(channel)
    );
    const length = buffer.length;
    const windowSize = Math.max(1, Math.min(TRIM_WINDOW_SIZE, length));
    const levelAt = sample => {
      let level = 0;
      for (const channel of channels) level = Math.max(level, Math.abs(channel[sample]));
      return level;
    };

    if (edge === 'start') {
      // Check consecutive TRIM_WINDOW_SIZE blocks from the beginning.
      // Delete a block when its average absolute level is not louder than TRIM_THRESHOLD.
      // Keep the audio starting at the first block that is louder than TRIM_THRESHOLD.
      for (let start = 0; start < length; start += windowSize) {
        const end = Math.min(start + windowSize, length);
        let levelSum = 0;

        for (let sample = start; sample < end; sample++) {
          levelSum += levelAt(sample);
        }

        const windowLevel = levelSum / Math.max(1, end - start);
        if (windowLevel > TRIM_THRESHOLD) {
          return { start, end: length };
        }
      }
      return null;
    }

    // Trim end: start at the END of the file and move backwards in complete windows.
    // Delete every trailing window only when EVERY sample in that window is below TRIM_THRESHOLD.
    // Stop as soon as a window contains any sample at or above the threshold.
    let trimEnd = length;

    for (let end = length; end - windowSize >= 0; end -= windowSize) {
      const start = end - windowSize;
      let wholeWindowBelowThreshold = true;

      for (let sample = start; sample < end; sample++) {
        if (levelAt(sample) >= TRIM_THRESHOLD) {
          wholeWindowBelowThreshold = false;
          break;
        }
      }

      if (!wholeWindowBelowThreshold) break;
      trimEnd = start;
    }

    return { start: 0, end: trimEnd };
  }

  toWave(buffer, multiplier, startSample = 0, endSample = buffer.length) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const samples = Math.max(0, endSample - startSample);
    const dataSize = samples * channels * 2;
    const output = new ArrayBuffer(44 + dataSize);
    const view = new DataView(output);
    const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let sample = 0; sample < samples; sample++) {
      for (let channel = 0; channel < channels; channel++) {
        const value = Math.max(-1, Math.min(1, channelData[channel][startSample + sample] * multiplier));
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([output], { type: 'audio/wav' });
  }
}
