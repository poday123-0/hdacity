-- Remove duplicate center_payments keeping only the earliest one per vehicle+month
DELETE FROM center_payments a USING center_payments b
WHERE a.id > b.id AND a.vehicle_id = b.vehicle_id AND a.payment_month = b.payment_month;

-- Add unique constraint to prevent future duplicates
ALTER TABLE center_payments ADD CONSTRAINT center_payments_vehicle_month_unique UNIQUE (vehicle_id, payment_month);