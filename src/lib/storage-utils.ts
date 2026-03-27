import { supabase } from "@/integrations/supabase/client";

/**
 * Extract the bucket name and file path from a Supabase storage public URL.
 * Returns null if the URL doesn't match the expected pattern.
 */
export const parseStorageUrl = (url: string): { bucket: string; path: string } | null => {
  if (!url) return null;
  // Pattern: .../storage/v1/object/public/<bucket>/<path>
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(\?.*)?$/);
  if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  return null;
};

/**
 * Delete a file from Supabase storage given its public URL.
 * Silently ignores errors (file may not exist).
 */
export const deleteStorageFile = async (publicUrl: string | null | undefined): Promise<boolean> => {
  if (!publicUrl) return false;
  const parsed = parseStorageUrl(publicUrl);
  if (!parsed) return false;
  const { error } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
  return !error;
};
