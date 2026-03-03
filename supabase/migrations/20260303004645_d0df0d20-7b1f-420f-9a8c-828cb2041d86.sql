-- Enable realtime for system_settings so we can broadcast force-refresh signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;