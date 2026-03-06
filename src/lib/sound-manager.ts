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
const POOL_SIZE = 4;

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
      // Unlock by attempting play of silence
      a.play().then(() => a.pause()).catch(() => {});
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
      // Can't guarantee unlock here since no gesture, but still try
      a.play().then(() => a.pause()).catch(() => {});
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
    activeSounds.add(audio);

    const cleanup = () => {
      activeSounds.delete(audio);
      replenish();
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    audio.addEventListener("pause", () => activeSounds.delete(audio), { once: true });

    audio.play().catch(() => {
      activeSounds.delete(audio);
    });
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
