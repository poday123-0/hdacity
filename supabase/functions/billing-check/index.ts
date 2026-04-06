import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get billing due day from settings
    const { data: dueDaySetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "billing_due_day")
      .single();
    const billingDueDay = dueDaySetting?.value
      ? typeof dueDaySetting.value === "number"
        ? dueDaySetting.value
        : parseInt(String(dueDaySetting.value)) || 25
      : 25;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentDay = now.getDate();
    const isReminderDay = currentDay === billingDueDay - 1; // 24hrs before
    const isDueDay = currentDay >= billingDueDay;

    // Fetch all active drivers
    const { data: drivers } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number, country_code, monthly_fee, fee_free_until, company_id, status")
      .ilike("user_type", "%Driver%");

    if (!drivers || drivers.length === 0) {
      return new Response(JSON.stringify({ message: "No drivers found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch companies to check fee_free
    const { data: companies } = await supabase
      .from("companies")
      .select("id, fee_free")
      .eq("is_active", true);
    const feeFreeCompanyIds = new Set(
      (companies || []).filter((c) => c.fee_free).map((c) => c.id)
    );

    // Fetch all active vehicles with their vehicle_type_id and center info
    const { data: allVehicles } = await supabase
      .from("vehicles")
      .select("id, driver_id, vehicle_type_id, center_code, pays_app_fee")
      .eq("is_active", true);

    // Fetch all vehicle types with their monthly_fee
    const { data: vehicleTypes } = await supabase
      .from("vehicle_types")
      .select("id, monthly_fee")
      .eq("is_active", true);
    const vtFeeMap = new Map((vehicleTypes || []).map((vt) => [vt.id, vt.monthly_fee || 0]));

    // Calculate per-driver fee from their vehicles' vehicle types
    const driverFeeMap = new Map<string, number>();
    for (const v of (allVehicles || [])) {
      if (!v.driver_id || !v.vehicle_type_id) continue;
      // Skip center-code vehicles that don't pay app fee
      if (v.center_code && !v.pays_app_fee) continue;
      const vtFee = vtFeeMap.get(v.vehicle_type_id) || 0;
      driverFeeMap.set(v.driver_id, (driverFeeMap.get(v.driver_id) || 0) + vtFee);
    }

    // Fetch approved payments for current month
    const { data: paidPayments } = await supabase
      .from("driver_payments")
      .select("driver_id, status")
      .eq("payment_month", currentMonth)
      .eq("status", "approved");
    const paidDriverIds = new Set((paidPayments || []).map((p) => p.driver_id));

    // Fetch submitted (pending) payments for current month
    const { data: pendingPayments } = await supabase
      .from("driver_payments")
      .select("driver_id")
      .eq("payment_month", currentMonth)
      .eq("status", "submitted");
    const pendingDriverIds = new Set((pendingPayments || []).map((p) => p.driver_id));

    // Filter drivers who owe fees (based on vehicle type monthly_fee)
    const driversOwingFees = drivers.filter((d) => {
      const totalFee = driverFeeMap.get(d.id) || 0;
      if (totalFee === 0) return false;
      if (feeFreeCompanyIds.has(d.company_id)) return false;
      if (d.fee_free_until && new Date(d.fee_free_until) > now) return false;
      if (paidDriverIds.has(d.id)) return false;
      return true;
    });

    let smsCount = 0;
    let deactivatedCount = 0;

    // Send SMS reminders 24hrs before due date
    if (isReminderDay) {
      const msgOwlKey = Deno.env.get("MSGOWL_API_KEY");
      if (msgOwlKey) {
        for (const driver of driversOwingFees) {
          // Don't remind drivers who already submitted payment
          if (pendingDriverIds.has(driver.id)) continue;

          const totalFee = driverFeeMap.get(driver.id) || 0;
          const phone = `${driver.country_code || "960"}${driver.phone_number}`;
          const message = `Hi ${driver.first_name}, your monthly fee of ${totalFee} MVR is due tomorrow. Please pay to continue driving. - HDA`;

          try {
            await fetch("https://rest.msgowl.com/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `AccessKey ${msgOwlKey}`,
              },
              body: JSON.stringify({
                recipients: phone,
                body: message,
              }),
            });
            smsCount++;
          } catch (err) {
            console.error(`SMS failed for ${driver.phone_number}:`, err);
          }
        }
      }
    }

    // Deactivate drivers on/after due date who haven't paid
    if (isDueDay) {
      for (const driver of driversOwingFees) {
        // Skip if already inactive or if they have a pending payment awaiting review
        if (driver.status !== "Active") continue;
        if (pendingDriverIds.has(driver.id)) continue;

        await supabase
          .from("profiles")
          .update({ status: "Billing_hold" } as any)
          .eq("id", driver.id);

        // Also mark offline
        await supabase
          .from("driver_locations")
          .update({ is_online: false } as any)
          .eq("driver_id", driver.id);

        deactivatedCount++;
      }
    }

    // ---- CENTER BILLING ENFORCEMENT (due day = 5th) ----
    const centerDueDay = 5;
    const isCenterDueDay = currentDay >= centerDueDay;
    let centerDeactivated = 0;

    if (isCenterDueDay) {
      // Get all center-code vehicles
      const { data: centerVehicles } = await supabase
        .from("vehicles")
        .select("id, center_code, vehicle_type_id, is_active")
        .not("center_code", "is", null)
        .eq("is_active", true);

      if (centerVehicles && centerVehicles.length > 0) {
        // Get approved center payments for current month
        const { data: approvedCenterPayments } = await supabase
          .from("center_payments")
          .select("vehicle_id")
          .eq("payment_month", currentMonth)
          .eq("status", "approved");
        const paidCenterVehicleIds = new Set((approvedCenterPayments || []).map((p) => p.vehicle_id));

        // Get submitted (pending review) center payments
        const { data: submittedCenterPayments } = await supabase
          .from("center_payments")
          .select("vehicle_id")
          .eq("payment_month", currentMonth)
          .eq("status", "submitted");
        const pendingCenterVehicleIds = new Set((submittedCenterPayments || []).map((p) => p.vehicle_id));

        // Get vehicle type center fees
        const { data: vtCenterFees } = await supabase
          .from("vehicle_types")
          .select("id, center_fee");
        const centerFeeMap = new Map((vtCenterFees || []).map((vt) => [vt.id, vt.center_fee || 0]));

        for (const cv of centerVehicles) {
          const fee = centerFeeMap.get(cv.vehicle_type_id) || 0;
          if (fee === 0) continue; // No center fee
          if (paidCenterVehicleIds.has(cv.id)) continue; // Already paid
          if (pendingCenterVehicleIds.has(cv.id)) continue; // Payment pending review

          // Deactivate vehicle
          await supabase
            .from("vehicles")
            .update({ is_active: false })
            .eq("id", cv.id);
          centerDeactivated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        currentMonth,
        billingDueDay,
        currentDay,
        isReminderDay,
        isDueDay,
        driversOwingFees: driversOwingFees.length,
        smsCount,
        deactivatedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Billing check error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
