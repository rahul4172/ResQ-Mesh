/**
 * ResQ-Mesh Web Audio Monitor Service (Clean & Hiss-Free)
 * Eliminates harsh random noise bursts and provides clean acoustic voice monitoring.
 */

class AudioMonitorService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micFilter: BiquadFilterNode | null = null;

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
    if (this.isMonitoring) {
      // Clean, pleasant high-tech activation chime (zero noise, zero hiss)
      this.playPureTone(659.25, 0.08, 0.15); // E5
      setTimeout(() => this.playPureTone(880.0, 0.12, 0.18), 80); // A5
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
   * Toggles Line-In / Microphone input pass-through with active noise filter
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
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.micStream = stream;

        if (this.ctx && this.masterGain) {
          this.micSource = this.ctx.createMediaStreamSource(stream);

          // Bandpass filter to remove rumble and high-pitch hiss (300Hz to 3400Hz speech band)
          const lowcut = this.ctx.createBiquadFilter();
          lowcut.type = 'highpass';
          lowcut.frequency.setValueAtTime(300, this.ctx.currentTime);

          const highcut = this.ctx.createBiquadFilter();
          highcut.type = 'lowpass';
          highcut.frequency.setValueAtTime(3400, this.ctx.currentTime);

          this.micSource.connect(lowcut);
          lowcut.connect(highcut);
          highcut.connect(this.masterGain);
        }

        this.isMicActive = true;
        this.playPureTone(1046.5, 0.1, 0.15); // C6
        return true;
      } catch (err) {
        console.warn('Microphone / Line-In permission denied:', err);
        this.isMicActive = false;
        return false;
      }
    }
  }

  /**
   * Plays a synthesized voice audio test sample (synthesized speech via Web Speech API or pure harmonic chord)
   */
  public playVoiceTestSample() {
    this.initContext();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("ResQ-Mesh Voice Decoder test. Signal strength nominal.");
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = this.volume;
      window.speechSynthesis.speak(utterance);
    } else {
      // Harmonic tactical alert tone fallback
      this.playPureTone(523.25, 0.1, 0.15); // C5
      setTimeout(() => this.playPureTone(659.25, 0.1, 0.15), 100); // E5
      setTimeout(() => this.playPureTone(783.99, 0.15, 0.15), 200); // G5
    }
  }

  /**
   * Called on every audio lifecycle or peak amplitude update.
   * Completely eliminated white noise / random static hiss!
   */
  public updateAudioTelemetry(isStreaming: boolean, peakLevel: number) {
    if (!this.isMonitoring || !this.ctx) return;

    if (isStreaming && !this.wasStreaming) {
      // Transmission start notification: subtle, pleasant tactical chirp
      this.playPureTone(784.0, 0.05, 0.1);
      this.wasStreaming = true;
    } else if (!isStreaming && this.wasStreaming) {
      // Transmission end notification: clean roger double-chirp
      this.playPureTone(659.25, 0.04, 0.08);
      setTimeout(() => this.playPureTone(523.25, 0.06, 0.08), 50);
      this.wasStreaming = false;
    }
  }

  private playPureTone(freq: number, duration: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'sine'; // Pure sine wave, ZERO HISS
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(vol * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {}
  }
}

export const audioMonitor = new AudioMonitorService();
