// Small "get their attention" helpers shared by the customer order page and
// the kitchen dashboard — no audio files to host, synthesized on the fly.

type ToneOptions = {
  type?: OscillatorType;
  peakGain?: number;
  noteDuration?: number;
  noteGap?: number;
};

function playTonesOnce(freqs: number[], options: ToneOptions = {}) {
  const { type = 'sine', peakGain = 0.35, noteDuration = 0.35, noteGap = 0.18 } = options;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // A compressor lets us push the oscillators much louder than a bare
    // GainNode could without the overlapping notes clipping into harsh
    // digital distortion — it's what makes the louder/richer waveform below
    // sound "punchy" instead of crackly on small laptop/phone speakers.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(14, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.1, now);
    compressor.connect(ctx.destination);

    freqs.forEach((freq, i) => {
      const start = now + i * noteGap;
      const stop = start + noteDuration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(start);
      osc.stop(stop + 0.05);

      // A second oscillator an octave up, mixed in quietly, adds harmonic
      // "edge" that cuts through background noise (espresso machine, chatter)
      // far better than a single pure tone at the same volume.
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      overtone.type = type;
      overtone.frequency.value = freq * 2;
      overtoneGain.gain.setValueAtTime(0, start);
      overtoneGain.gain.linearRampToValueAtTime(peakGain * 0.25, start + 0.015);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, stop);
      overtone.connect(overtoneGain);
      overtoneGain.connect(compressor);
      overtone.start(start);
      overtone.stop(stop + 0.05);
    });

    // Tear the context down once the last note has finished so repeated
    // notifications don't pile up audio contexts in the background.
    const totalMs = (freqs.length * noteGap + noteDuration + 0.2) * 1000;
    setTimeout(() => ctx.close().catch(() => {}), totalMs);
  } catch {
    // Audio isn't critical to the notification — fail silently.
  }
}

// Two-note chime — used on the customer page when their order goes 'ready'.
// The customer is looking at their one screen waiting for this, so a single
// gentle chime is enough; no need for the kitchen's louder, repeated alarm.
export function playReadyChime() {
  playTonesOnce([880, 1175]);
}

// Loud, attention-grabbing alarm for a brand-new order on the kitchen
// dashboard. Kitchen staff are often mid-task with the espresso machine
// running and the room noisy, so this needs to be both LOUD (near-max gain,
// run through a compressor so it doesn't just distort) and DISTINCTIVE (a
// buzzy square wave + octave overtone, not a soft sine blip) — then it
// repeats three times so a momentary distraction doesn't mean a missed order.
export function playNewOrderChime() {
  const burst = () =>
    playTonesOnce([784, 988, 1245], {
      type: 'square',
      peakGain: 0.9,
      noteDuration: 0.22,
      noteGap: 0.16,
    });
  burst();
  setTimeout(burst, 900);
  setTimeout(burst, 1800);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
