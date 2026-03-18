/**
 * Global sound manager — tracks all currently playing Audio elements
 * so they can be stopped from anywhere (e.g. on decline, trip taken).
 *
 * Also maintains a pre-unlocked Audio element pool so sounds can play
 * even when the PWA is minimized / backgrounded (bypasses autoplay restrictions).
 *
 * Uses a silent audio heartbeat to prevent the browser from suspending
 * the audio context when the page is hidden/minimized.
 *
 * Includes iOS-specific workarounds:
 * - Web Audio API heartbeat for more reliable background audio
 * - Pending sound replay from service worker on visibilitychange
 */

const activeSounds: Set<HTMLAudioElement> = new Set();

// Pool of pre-unlocked Audio elements created during user gestures.
// Browsers allow these to play even when the page is hidden/minimized.
const unlockedPool: HTMLAudioElement[] = [];
const POOL_SIZE = 8;

// Silent heartbeat to keep audio context alive when minimized
let heartbeatAudio: HTMLAudioElement | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let audioCtxHeartbeat: AudioContext | null = null;
let audioCtxOscillator: OscillatorNode | null = null;

// Tiny silent WAV (minimal valid WAV file)
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

// Detect iOS
const isIOS = () => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

/**
 * Start a Web Audio API based heartbeat. This is more reliable than
 * HTMLAudioElement on iOS for keeping the audio pipeline alive.
 */
const startWebAudioHeartbeat = () => {
  if (audioCtxHeartbeat) return;
  try {
    audioCtxHeartbeat = new AudioContext();
    // Create a near-silent oscillator to keep the context alive
    audioCtxOscillator = audioCtxHeartbeat.createOscillator();
    const gain = audioCtxHeartbeat.createGain();
    gain.gain.value = 0.001; // Nearly silent
    audioCtxOscillator.connect(gain);
    gain.connect(audioCtxHeartbeat.destination);
    audioCtxOscillator.frequency.value = 20; // Sub-audible
    audioCtxOscillator.start();
  } catch {}
};

/**
 * Resume the AudioContext when it gets suspended (iOS does this on background).
 */
const resumeAudioContext = () => {
  if (audioCtxHeartbeat && audioCtxHeartbeat.state === "suspended") {
    audioCtxHeartbeat.resume().catch(() => {});
  }
};

/**
 * Start a silent audio heartbeat that keeps the browser's audio pipeline
 * active even when the PWA is minimized. This prevents the browser from
 * suspending Audio elements when the page is hidden.
 */
const startHeartbeat = () => {
  if (heartbeatInterval) return;

  // Start Web Audio API heartbeat (more reliable on iOS)
  startWebAudioHeartbeat();
  
  // Also keep the HTMLAudioElement heartbeat as fallback
  try {
    heartbeatAudio = new Audio(SILENT_WAV);
    heartbeatAudio.loop = true;
    heartbeatAudio.volume = 0.01; // near-silent but not 0
    heartbeatAudio.play().catch(() => {});
  } catch {}

  // Periodically nudge audio to keep it alive (shorter interval for iOS)
  const interval = isIOS() ? 5_000 : 10_000;
  heartbeatInterval = setInterval(() => {
    // Resume Web Audio context if suspended
    resumeAudioContext();
    
    if (heartbeatAudio) {
      try {
        if (heartbeatAudio.paused) {
          heartbeatAudio.play().catch(() => {});
        }
      } catch {}
    }
    // Top up the pool periodically
    topUpPool();
  }, interval);

  // iOS: resume audio context on visibility change
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        resumeAudioContext();
        if (heartbeatAudio?.paused) {
          heartbeatAudio.play().catch(() => {});
        }
        // Check for pending sounds from SW
        checkPendingSounds();
      }
    });
  }
};

/** Check service worker for any pending sounds that couldn't play while backgrounded */
const checkPendingSounds = async () => {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  
  try {
    const channel = new MessageChannel();
    const response = await new Promise<any>((resolve) => {
      const timeout = setTimeout(() => resolve({ sounds: [] }), 2000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      navigator.serviceWorker.controller!.postMessage(
        { type: "GET_PENDING_SOUNDS" },
        [channel.port2]
      );
    });

    if (response?.sounds?.length > 0) {
      console.log(`[SoundManager] Playing ${response.sounds.length} pending sound(s) from SW`);
      // Only play sounds from the last 5 minutes
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      for (const s of response.sounds) {
        if (s.timestamp > fiveMinAgo && s.sound_url) {
          const shouldLoop = s.notification_type === "trip_requested" || s.notification_type === "sos_alert";
          playTrackedSound(s.sound_url, shouldLoop);
          break; // Only play the most recent relevant sound
        }
      }
    }
  } catch {}
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

  // Resume/create Web Audio context on user gesture (critical for iOS)
  if (audioCtxHeartbeat) {
    resumeAudioContext();
  } else {
    startWebAudioHeartbeat();
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
    // Resume audio context first (iOS may have suspended it)
    resumeAudioContext();

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
          fallback.play().catch(() => {
            activeSounds.delete(fallback);
            // Last resort on iOS: try Web Audio API to play the sound
            if (isIOS()) {
              tryWebAudioPlayback(url);
            }
          });
        } catch {}
      });
    }
    return audio;
  } catch {
    return null;
  }
};

/**
 * Last-resort iOS playback using Web Audio API + fetch.
 * This can sometimes work when HTMLAudioElement is blocked.
 */
const tryWebAudioPlayback = async (url: string) => {
  try {
    const ctx = audioCtxHeartbeat || new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
    console.log("[SoundManager] Web Audio API fallback succeeded");
  } catch (err) {
    console.warn("[SoundManager] Web Audio API fallback failed:", err);
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
  if (audioCtxOscillator) {
    try { audioCtxOscillator.stop(); } catch {}
    audioCtxOscillator = null;
  }
  if (audioCtxHeartbeat) {
    try { audioCtxHeartbeat.close(); } catch {}
    audioCtxHeartbeat = null;
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
