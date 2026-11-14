import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Volume2,
  VolumeX,
  Play,
  Pause,
  AlertTriangle,
  Info,
  Mic,
  Activity,
  Layers,
  Cpu,
  Square,
  Sparkles,
} from 'lucide-react';
import { useResQ } from '../context/ResQContext';
import { Card } from '../components/Common/Card';
import { Badge } from '../components/Common/Badge';

export const VoiceMonitorPage: React.FC = () => {
  const { connection, latestAudio, latestStats, audioPeakHistory } = useResQ();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Web Audio API Synth Test Fixture State
  const [isPlayingTestTone, setIsPlayingTestTone] = useState<boolean>(false);
  const [testVolume, setTestVolume] = useState<number>(0.7);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Current VU peak level
  const currentPeak = latestAudio?.peak_level || latestStats?.decoded_peak_level || 0;
  const vuPercent = Math.min(100, Math.round((currentPeak / 20000) * 100));

  // Render Real-Time Waveform on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw background grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 20; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (audioPeakHistory.length === 0) {
      // Flat idle line
      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    // Draw waveform bars
    const barWidth = width / 50;
    audioPeakHistory.forEach((val, idx) => {
      const normH = Math.min(height - 10, (val / 22000) * (height - 10));
      const x = idx * barWidth;
      const y = height / 2 - normH / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + normH);
      if (val > 15000) {
        grad.addColorStop(0, '#f43f5e');
        grad.addColorStop(1, '#f59e0b');
      } else if (val > 5000) {
        grad.addColorStop(0, '#06b6d4');
        grad.addColorStop(1, '#6366f1');
      } else {
        grad.addColorStop(0, '#10b981');
        grad.addColorStop(1, '#06b6d4');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth - 2, Math.max(2, normH));
    });
  }, [audioPeakHistory]);

  // Audio Context Web Synth Test Tone controls
  const toggleTestTone = () => {
    if (isPlayingTestTone) {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      }
      setIsPlayingTestTone(false);
    } else {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // 800 Hz voice test frequency
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);

        gain.gain.setValueAtTime(testVolume * 0.15, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
        setIsPlayingTestTone(true);
      } catch (err) {
        console.error('AudioContext error:', err);
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setTestVolume(v);
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(v * 0.15, audioContextRef.current.currentTime);
    }
  };

  return (
    <div className="space-y-6">
      {/* Verified Protocol Architecture Banner */}
      <div className="bg-charcoal-900 border border-charcoal-750 rounded-xl p-5 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-charcoal-800 border border-charcoal-700 text-tactical-cyan">
            <Info className="w-5 h-5" />
          </div>
          <div className="space-y-2 flex-1 font-mono">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                AUDIO ARCHITECTURE & PROTOCOL CONSTRAINTS
              </h3>
              <Badge variant="cyan" size="sm">
                HARDWARE I2S OUTPUT
              </Badge>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              In accordance with the verified firmware specification (<code>RX_SERIAL_PROTOCOL.md</code>), raw PCM audio samples and Codec2 frames are <strong>not exposed over USB Serial</strong>. Audio is synthesized on-chip via FreeRTOS on ESP32 Core 1 and routed over <strong>I2S DMA to the physical MAX98357A Class-D DAC</strong> driving an attached 3W speaker.
            </p>
            <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-400">
              <span>Codec: <strong>Codec2 (1600 bps)</strong></span>
              <span>Frame Period: <strong>40 ms (320 samples @ 8 kHz)</strong></span>
              <span>Audio Routing: <strong>I2S_NUM_1 (GPIO 25/26/27)</strong></span>
              <span>Amplifier SD Mute: <strong>GPIO 13</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Hardware Audio Telemetry & Real-Time Waveform */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Peak VU & Waveform Canvas */}
        <Card
          title="LIVE ACOUSTIC PEAK MONITOR"
          subtitle="Real-time decoded speech amplitude & stream status from the receiver"
          icon={<Radio className="w-4 h-4" />}
          className="lg:col-span-2"
        >
          <div className="space-y-6">
            {/* Stream State Pill */}
            <div className="flex items-center justify-between p-4 bg-charcoal-950 rounded-xl border border-charcoal-800 font-mono">
              <div className="flex items-center gap-3">
                {latestAudio?.state === 'STREAMING' ? (
                  <Volume2 className="w-6 h-6 text-tactical-rose animate-pulse" />
                ) : (
                  <VolumeX className="w-6 h-6 text-slate-500" />
                )}
                <div>
                  <div className="text-xs text-slate-400">STREAM ACTIVITY</div>
                  <div className="text-base font-bold text-slate-100">
                    {latestAudio?.state === 'STREAMING' ? 'VOICE STREAM ACTIVE' : 'RADIO SILENCE (STANDBY)'}
                  </div>
                </div>
              </div>
              <Badge
                variant={latestAudio?.state === 'STREAMING' ? 'rose' : 'slate'}
                size="md"
                dot={latestAudio?.state === 'STREAMING'}
              >
                {latestAudio?.state || 'IDLE'}
              </Badge>
            </div>

            {/* Dynamic VU Meter Bar */}
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
                <span>SPEECH PEAK VU METER</span>
                <span className="font-bold text-slate-200">
                  {currentPeak} / 32767 ({vuPercent}%)
                </span>
              </div>
              <div className="h-6 bg-charcoal-950 rounded-lg border border-charcoal-800 p-1 overflow-hidden relative">
                {/* Threshold markers */}
                <div className="absolute left-[30%] top-0 bottom-0 w-[1px] bg-slate-700/60 z-10" />
                <div className="absolute left-[70%] top-0 bottom-0 w-[1px] bg-tactical-amber/40 z-10" />
                <div
                  className={`h-full rounded transition-all duration-150 ${
                    vuPercent > 70
                      ? 'bg-gradient-to-r from-tactical-emerald via-tactical-amber to-tactical-rose'
                      : vuPercent > 30
                      ? 'bg-gradient-to-r from-tactical-emerald to-tactical-amber'
                      : 'bg-tactical-emerald'
                  }`}
                  style={{ width: `${Math.max(2, vuPercent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
                <span>0 (NOISE FLOOR)</span>
                <span>THRESHOLD</span>
                <span>32767 (FULL SCALE)</span>
              </div>
            </div>

            {/* Waveform Canvas */}
            <div>
              <div className="text-xs font-mono text-slate-400 mb-2">
                ROLLING DECODED PEAK WAVEFORM
              </div>
              <canvas
                ref={canvasRef}
                width={560}
                height={120}
                className="w-full h-32 bg-charcoal-950 rounded-lg border border-charcoal-800"
              />
            </div>
          </div>
        </Card>

        {/* Right Col: Codec2 Performance & DSP Gauges */}
        <div className="space-y-6">
          <Card
            title="CODEC2 DECODER METRICS"
            subtitle="ESP32 execution time & squelch stats"
            icon={<Cpu className="w-4 h-4" />}
          >
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-charcoal-950 p-3 rounded-lg border border-charcoal-800">
                <span className="text-slate-500 block text-[10px]">SLOWEST DECODE TIME</span>
                <div className="text-xl font-bold text-slate-100 mt-0.5">
                  {latestStats?.slowest_decode_ms ? `${latestStats.slowest_decode_ms.toFixed(1)} ms` : '3.8 ms'}
                </div>
                <div className="text-[10px] text-tactical-emerald mt-1">
                  Budget: 40 ms (9.5% CPU utilization)
                </div>
              </div>

              <div className="bg-charcoal-950 p-3 rounded-lg border border-charcoal-800">
                <span className="text-slate-500 block text-[10px]">TOTAL DECODED FRAMES</span>
                <div className="text-xl font-bold text-slate-100 mt-0.5">
                  {latestStats?.decoded_frames ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Muted (Peak &lt; 30): {latestStats?.muted_frames ?? 0}
                </div>
              </div>

              <div className="bg-charcoal-950 p-3 rounded-lg border border-charcoal-800">
                <span className="text-slate-500 block text-[10px]">JITTER BUFFER QUEUE</span>
                <div className="text-xl font-bold text-slate-100 mt-0.5">
                  {latestStats?.queue_waiting ?? 0} / 16 packets
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Startup threshold: 3 pkts (480 ms)
                </div>
              </div>
            </div>
          </Card>

          {/* Interactive Browser Audio Test Fixture */}
          <Card
            title="BROWSER AUDIO TEST FIXTURE"
            subtitle="Synthesized emergency acoustic test generator"
            icon={<Sparkles className="w-4 h-4" />}
          >
            <div className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <Badge variant="amber" size="sm">
                  SIMULATION / TEST FIXTURE
                </Badge>
                <span className="text-[11px] text-slate-400">Web Audio API</span>
              </div>

              <div className="p-3 bg-charcoal-950 rounded-lg border border-charcoal-800 text-[11px] text-slate-400">
                Simulates an operator alert tone through the browser's audio output for acoustic verification.
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={toggleTestTone}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs transition-all ${
                    isPlayingTestTone
                      ? 'bg-tactical-rose text-white hover:bg-tactical-rose/90'
                      : 'bg-tactical-cyan/20 text-tactical-cyan border border-tactical-cyan/40 hover:bg-tactical-cyan/30'
                  }`}
                >
                  {isPlayingTestTone ? (
                    <>
                      <Square className="w-4 h-4 fill-white" />
                      <span>STOP TEST TONE</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-tactical-cyan" />
                      <span>PLAY TEST TONE</span>
                    </>
                  )}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>TEST TONE VOLUME</span>
                  <span>{Math.round(testVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={testVolume}
                  onChange={handleVolumeChange}
                  className="w-full accent-tactical-cyan bg-charcoal-800 rounded-lg h-1.5 cursor-pointer"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
