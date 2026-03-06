/**
 * Global sound manager — tracks all currently playing Audio elements
 * so they can be stopped from anywhere (e.g. on decline, trip taken).
 */

const activeSounds: Set<HTMLAudioElement> = new Set();

/** Play a sound and track it globally. Returns the Audio element. */
export const playTrackedSound = (url: string, loop = false): HTMLAudioElement | null => {
  if (!url) return null;
  try {
    const audio = new Audio(url);
    audio.loop = loop;
    activeSounds.add(audio);
    audio.addEventListener("ended", () => activeSounds.delete(audio));
    audio.addEventListener("pause", () => activeSounds.delete(audio));
    audio.play().catch(() => {});
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
