
-- Speed up Admin Trips listing: created_at descending is the hot ordering column.
CREATE INDEX IF NOT EXISTS idx_trips_created_at_desc ON public.trips (created_at DESC);

-- Composite indexes for the most common filter combinations used in the admin Trips screen.
CREATE INDEX IF NOT EXISTS idx_trips_status_created_at ON public.trips (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_booking_type_created_at ON public.trips (booking_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_dispatch_type_created_at ON public.trips (dispatch_type, created_at DESC);

-- Foreign-key lookups used in joins / per-driver / per-passenger queries.
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips (driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_passenger_id ON public.trips (passenger_id);

-- Speed up trip_messages and trip_declines lookups by trip.
CREATE INDEX IF NOT EXISTS idx_trip_messages_trip_id ON public.trip_messages (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_declines_trip_id ON public.trip_declines (trip_id);
