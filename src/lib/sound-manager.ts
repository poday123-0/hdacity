/**
 * Global sound manager — tracks all currently playing Audio elements
 * so they can be stopped from anywhere (e.g. on decline, trip taken).
 *
 * Also maintains a pre-unlocked Audio element pool so sounds can play
 * even when the PWA is minimized / backgrounded (bypasses autoplay restrictions).
 */

const activeSounds: Set<HTMLAudioElement> = new Set();

// Pool of pre-unlocked Audio elements created during user gestures.
// Browsers allow these to play even when the page is hidden/minimized.
const unlockedPool: HTMLAudioElement[] = [];
const POOL_SIZE = 6; // Increased pool for reliability

/**
 * Call this inside a user-gesture handler (click, tap, etc.) to
 * pre-unlock Audio elements for later background playback.
 * Safe to call multiple times — it only tops up the pool.
 */
export const unlockAudioPool = () => {
  const needed = POOL_SIZE - unlockedPool.length;
  for (let i = 0; i < needed; i++) {
    try {
      const a = new Audio();
      a.preload = "auto";
      // Unlock by playing a tiny silent WAV data URI then pausing
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
      const playPromise = a.play();
      if (playPromise) {
        playPromise.then(() => a.pause()).catch(() => {});
      }
      unlockedPool.push(a);
    } catch {}
  }
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
      // Use silent WAV for replenish too
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
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
