/**
 * Global sound manager — tracks all currently playing Audio elements
 * so they can be stopped from anywhere (e.g. on decline, trip taken).
 *
 * Also maintains a pre-unlocked Audio element pool so sounds can play
 * even when the PWA is minimized / backgrounded (bypasses autoplay restrictions).
 *
 * Uses a silent audio heartbeat to prevent the browser from suspending
 * the audio context when the page is hidden/minimized.
 */

const activeSounds: Set<HTMLAudioElement> = new Set();

// Pool of pre-unlocked Audio elements created during user gestures.
// Browsers allow these to play even when the page is hidden/minimized.
const unlockedPool: HTMLAudioElement[] = [];
const POOL_SIZE = 8;

// Silent heartbeat to keep audio context alive when minimized
let heartbeatAudio: HTMLAudioElement | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Tiny silent WAV (minimal valid WAV file)
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

/**
 * Start a silent audio heartbeat that keeps the browser's audio pipeline
 * active even when the PWA is minimized. This prevents the browser from
 * suspending Audio elements when the page is hidden.
 */
const startHeartbeat = () => {
  if (heartbeatInterval) return;
  
  // Create a looping silent audio element
  try {
    heartbeatAudio = new Audio(SILENT_WAV);
    heartbeatAudio.loop = true;
    heartbeatAudio.volume = 0.01; // near-silent but not 0 (some browsers optimize away volume=0)
    heartbeatAudio.play().catch(() => {});
  } catch {}

  // Periodically nudge the audio to keep it alive
  heartbeatInterval = setInterval(() => {
    if (heartbeatAudio) {
      try {
        if (heartbeatAudio.paused) {
          heartbeatAudio.play().catch(() => {});
        }
      } catch {}
    }
    // Also top up the pool periodically
    topUpPool();
  }, 10_000);
};

/** Top up the pool without requiring a user gesture (best-effort). */
const topUpPool = () => {
  const needed = POOL_SIZE - unlockedPool.length;
  for (let i = 0; i < needed; i++) {
    try {
      const a = new Audio();
      a.preload = "auto";
      a.src = SILENT_WAV;
      const p = a.play();
      if (p) p.then(() => a.pause()).catch(() => {});
      unlockedPool.push(a);
    } catch {}
  }
};

/**
 * Call this inside a user-gesture handler (click, tap, etc.) to
 * pre-unlock Audio elements for later background playback.
 * Also starts the silent heartbeat to keep audio alive when minimized.
 * Safe to call multiple times — it only tops up the pool.
 */
export const unlockAudioPool = () => {
  const needed = POOL_SIZE - unlockedPool.length;
  for (let i = 0; i < needed; i++) {
    try {
      const a = new Audio();
      a.preload = "auto";
      a.src = SILENT_WAV;
      const playPromise = a.play();
      if (playPromise) {
        playPromise.then(() => a.pause()).catch(() => {});
      }
      unlockedPool.push(a);
    } catch {}
  }
  // Start heartbeat on first user gesture
  startHeartbeat();
};

/** Get a pre-unlocked element from the pool (or create a new one as fallback). */
const getAudioElement = (): HTMLAudioElement => {
  // Prefer a pool element — these bypass autoplay restrictions when minimized
  const pooled = unlockedPool.shift();
  if (pooled) return pooled;
  // Fallback: create a new one (may be blocked if page is hidden)
  return new Audio();
};

/** Replenish one element into the pool after a sound finishes. */
const replenish = () => {
  if (unlockedPool.length < POOL_SIZE) {
    try {
      const a = new Audio();
      a.preload = "auto";
      a.src = SILENT_WAV;
      const p = a.play();
      if (p) p.then(() => a.pause()).catch(() => {});
      unlockedPool.push(a);
    } catch {}
  }
};

/** Play a sound and track it globally. Returns the Audio element. */
export const playTrackedSound = (url: string, loop = false): HTMLAudioElement | null => {
  if (!url) return null;
  try {
    const audio = getAudioElement();
    audio.loop = loop;
    audio.src = url;
    audio.currentTime = 0;
    // Force volume to max for background playback
    audio.volume = 1.0;
    activeSounds.add(audio);

    const cleanup = () => {
      activeSounds.delete(audio);
      replenish();
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    audio.addEventListener("pause", () => activeSounds.delete(audio), { once: true });

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        activeSounds.delete(audio);
        // If play fails (autoplay blocked), try with a fresh element
        try {
          const fallback = new Audio(url);
          fallback.volume = 1.0;
          fallback.loop = loop;
          activeSounds.add(fallback);
          fallback.addEventListener("ended", () => activeSounds.delete(fallback), { once: true });
          fallback.addEventListener("error", () => activeSounds.delete(fallback), { once: true });
          fallback.play().catch(() => activeSounds.delete(fallback));
        } catch {}
      });
    }
    return audio;
  } catch {
    return null;
  }
};

/** Stop the silent heartbeat (call when driver goes offline to save battery). */
export const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (heartbeatAudio) {
    try { heartbeatAudio.pause(); } catch {}
    heartbeatAudio = null;
  }
};

/** Stop ALL currently playing tracked sounds. */
export const stopAllSounds = () => {
  activeSounds.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  });
  activeSounds.clear();
};

/** Stop a specific audio element and untrack it. */
export const stopSound = (audio: HTMLAudioElement | null) => {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {}
  activeSounds.delete(audio);
};
