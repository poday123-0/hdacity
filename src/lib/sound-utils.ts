import { supabase } from "@/integrations/supabase/client";

/**
 * Parse a sound URL from a system_settings jsonb value.
 * Handles: plain string, JSON-quoted string, or object with url property.
 */
export const parseSoundUrl = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    // Remove surrounding quotes if present (from JSON storage)
    const cleaned = value.replace(/^"|"$/g, "").trim();
    return cleaned.startsWith("http") ? cleaned : null;
  }
  if (typeof value === "object" && value.url) {
    return String(value.url);
  }
  const str = String(value).replace(/^"|"$/g, "").trim();
  return str.startsWith("http") ? str : null;
};

/**
 * Fetch a single sound URL from system_settings by key.
 */
export const fetchSoundUrl = async (key: string): Promise<string | null> => {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .single();
  return parseSoundUrl(data?.value);
};

/**
 * Fetch multiple sound URLs from system_settings.
 * Returns a map of key suffix → URL.
 */
export const fetchSoundUrls = async (
  keys: string[],
  stripPrefix?: string
): Promise<Record<string, string>> => {
  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", keys);

  const map: Record<string, string> = {};
  data?.forEach((s: any) => {
    const url = parseSoundUrl(s.value);
    if (url) {
      const mapKey = stripPrefix ? s.key.replace(stripPrefix, "") : s.key;
      map[mapKey] = url;
    }
  });
  return map;
};

/**
 * Play a sound URL safely. Returns the Audio element or null.
 */
export const playSound = (url: string | null | undefined): HTMLAudioElement | null => {
  if (!url) return null;
  try {
    const audio = new Audio(url);
    audio.play().catch(() => {});
    return audio;
  } catch {
    return null;
  }
};

/**
 * Play a fallback beep when no sound URL is configured.
 */
export const playFallbackBeep = (frequency = 880, duration = 0.15) => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), duration * 2000);
  } catch {}
};
