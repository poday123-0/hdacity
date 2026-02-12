-- Add unique constraint on phone_number + user_type to prevent duplicate profiles
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_user_type_unique UNIQUE (phone_number, user_type);
