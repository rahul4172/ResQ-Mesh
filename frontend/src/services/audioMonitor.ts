/**
 * ResQ-Mesh Web Audio Monitor Service
 * Provides browser-based tactical acoustic playback for LoRa voice transmissions.
 *
 * Supports two operational monitoring modes:
 * 1. SYNTH MONITOR: Generates authentic military tactical radio audio feedback
 *    (carrier tone, formant speech resonance, and squelch tail) driven in real time
 *    by the receiver's decoded speech peak levels and stream lifecycle events.
 * 2. LINE-IN / MIC PASS-THROUGH: Captures physical receiver output plugged into the PC
 *    via 3.5mm AUX or room microphone and pipes it through browser speakers with volume control.
 */

class AudioMonitorService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private synthGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;

  private isMonitoring: boolean = false;
  private isMicActive: boolean = false;
  private volume: number = 0.8;
  private wasStreaming: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Synth Voice Filter (Bandpass 300Hz - 3400Hz Telecom Voice Filter)
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1000, this.ctx.currentTime);
      bandpass.Q.setValueAtTime(1.2, this.ctx.currentTime);

      this.synthGain = this.ctx.createGain();
      this.synthGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.synthGain.connect(bandpass);
      bandpass.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public toggleMonitoring(): boolean {
    this.initContext();
    this.isMonitoring = !this.isMonitoring;
    if (!this.isMonitoring) {
      this.stopSynth();
    } else {
      // Play brief activation chirp
      this.playTacticalChirp(880, 0.05);
    }
    return this.isMonitoring;
  }

  public getIsMonitoring(): boolean {
    return this.isMonitoring;
  }

  public getIsMicActive(): boolean {
    return this.isMicActive;
  }

  /**
   * Toggles Line-In / Microphone input pass-through directly to browser speakers.
   */
  public async toggleMicPassThrough(): Promise<boolean> {
    this.initContext();

    if (this.isMicActive) {
      if (this.micStream) {
        this.micStream.getTracks().forEach((track) => track.stop());
        this.micStream = null;
      }
      if (this.micSource) {
        this.micSource.disconnect();
        this.micSource = null;
      }
      this.isMicActive = false;
      return false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
          },
        });
        this.micStream = stream;

        if (this.ctx && this.masterGain) {
          this.micSource = this.ctx.createMediaStreamSource(stream);
          this.micGain = this.ctx.createGain();
          this.micGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
          this.micSource.connect(this.micGain);
          this.micGain.connect(this.masterGain);
        }

        this.isMicActive = true;
        this.playTacticalChirp(1200, 0.08);
        return true;
      } catch (err) {
        console.warn('Microphone / Line-In permission denied:', err);
        this.isMicActive = false;
        return false;
      }
    }
  }

  /**
   * Called on every audio lifecycle or peak amplitude update.
   */
  public updateAudioTelemetry(isStreaming: boolean, peakLevel: number) {
    if (!this.isMonitoring || !this.ctx || !this.synthGain) return;

    if (isStreaming && !this.wasStreaming) {
      // Radio transmission started: tactical squelch opening
      this.playSquelchBurst(0.04, 0.12);
      this.startSynth();
      this.wasStreaming = true;
    } else if (!isStreaming && this.wasStreaming) {
      // Radio transmission ended: tactical squelch tail "roger beep / tail burst"
      this.stopSynth();
      this.playSquelchBurst(0.08, 0.18);
      this.playTacticalChirp(1750, 0.06);
      this.wasStreaming = false;
    }

    if (isStreaming) {
      // Modulate synth amplitude with real-time decoded speech peak
      const targetGain = Math.min(0.25, Math.max(0.02, (peakLevel / 32767) * 0.25));
      this.synthGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.03);

      if (this.osc1 && this.osc2) {
        // Modulate formant frequencies subtly with speech dynamics
        const baseFreq = 160 + (peakLevel % 60);
        this.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.05);
        this.osc2.frequency.setTargetAtTime(baseFreq * 2.8, this.ctx.currentTime, 0.05);
      }
    }
  }

  private startSynth() {
    if (!this.ctx || !this.synthGain) return;
    try {
      this.stopSynth();

      const now = this.ctx.currentTime;
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(180, now);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'sine';
      this.osc2.frequency.setValueAtTime(520, now);

      this.osc1.connect(this.synthGain);
      this.osc2.connect(this.synthGain);

      this.osc1.start(now);
      this.osc2.start(now);
    } catch (e) {
      console.warn('Synth start error:', e);
    }
  }

  private stopSynth() {
    if (this.synthGain && this.ctx) {
      this.synthGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
    if (this.osc1) {
      try {
        this.osc1.stop();
        this.osc1.disconnect();
      } catch (_) {}
      this.osc1 = null;
    }
    if (this.osc2) {
      try {
        this.osc2.stop();
        this.osc2.disconnect();
      } catch (_) {}
      this.osc2 = null;
    }
  }

  private playTacticalChirp(freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + duration);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {}
  }

  private playSquelchBurst(duration: number, volume: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(2, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(now);
      noise.stop(now + duration);
    } catch (_) {}
  }
}

export const audioMonitor = new AudioMonitorService();
