// Small "get their attention" helpers shared by the customer order page and
// the kitchen dashboard — no audio files to host, synthesized on the fly.

function playTones(freqs: number[]) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio isn't critical to the notification — fail silently.
  }
}

// Two-note chime — used on the customer page when their order goes 'ready'.
export function playReadyChime() {
  playTones([880, 1175]);
}

// Three-note, slightly more urgent chime — used on the kitchen dashboard
// when a new order comes in, distinct from the customer's ready chime.
export function playNewOrderChime() {
  playTones([660, 880, 1175]);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}
