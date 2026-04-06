import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch ALL named_locations using pagination to bypass the 1000-row limit.
 */
export async function fetchAllNamedLocations(
  selectColumns = "name, lat, lng, address, description, group_name, road_name"
) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("named_locations")
      .select(selectColumns)
      .eq("is_active", true)
      .eq("status", "approved")
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allData;
}
