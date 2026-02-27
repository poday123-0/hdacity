INSERT INTO system_settings (key, value, description)
VALUES ('driver_registration_notify', '{"emails":[],"phones":[]}', 'Email addresses and phone numbers to notify when a new driver registers')
ON CONFLICT (key) DO NOTHING;