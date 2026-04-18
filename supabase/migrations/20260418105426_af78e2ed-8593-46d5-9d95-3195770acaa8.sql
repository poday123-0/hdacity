-- Enable realtime publication for all admin/dispatch tables
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'vehicles',
    'vehicle_types',
    'vehicle_makes',
    'driver_vehicle_types',
    'fare_zones',
    'fare_surcharges',
    'driver_payments',
    'center_payments',
    'banks',
    'companies',
    'saved_locations',
    'named_locations',
    'service_locations',
    'sos_alerts',
    'lost_item_reports',
    'notifications',
    'notification_sounds',
    'device_tokens',
    'ad_banners',
    'topup_cards',
    'topup_card_batches',
    'competitions',
    'competition_prizes',
    'trip_stops',
    'trip_declines',
    'driver_bank_accounts',
    'driver_favara_accounts',
    'driver_swipe_accounts',
    'emergency_contacts',
    'dispatch_duty_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip if table is already in publication or doesn't exist
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
    -- Set REPLICA IDENTITY FULL so UPDATE payloads include the full row
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;