import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface AdBannerProps {
  className?: string;
  audience?: "passengers" | "drivers";
}

const AdBanner = ({ className = "", audience = "passengers" }: AdBannerProps) => {
  const [banners, setBanners] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotationSeconds, setRotationSeconds] = useState(5);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: ads }, { data: settings }] = await Promise.all([
        supabase.from("ad_banners").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("system_settings").select("value").eq("key", "ad_banner_rotation_seconds").maybeSingle(),
      ]);
      setBanners(ads || []);
      if (settings?.value) {
        const v = typeof settings.value === "number" ? settings.value : parseInt(String(settings.value));
        if (v > 0) setRotationSeconds(v);
      }
    };
    fetch();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % banners.length);
    }, rotationSeconds * 1000);
    return () => clearInterval(interval);
  }, [banners.length, rotationSeconds]);

  if (banners.length === 0) return null;

  const banner = banners[currentIndex];
  if (!banner) return null;

  const content = (
    <motion.img
      key={banner.id}
      src={banner.image_url}
      alt="Ad"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full h-full object-cover rounded-xl"
    />
  );

  return (
    <div className={`overflow-hidden rounded-xl shadow-md border border-border/30 ${className}`} style={{ height: 56 }}>
      <AnimatePresence mode="wait">
        {banner.link_url ? (
          <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            {content}
          </a>
        ) : (
          content
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdBanner;
