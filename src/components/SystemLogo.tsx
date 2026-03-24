import { useBranding } from "@/hooks/use-branding";
import hdaLogoFallback from "@/assets/hda-logo.png";
import { useState } from "react";

interface SystemLogoProps {
  className?: string;
  alt?: string;
}

const SystemLogo = ({ className = "w-full h-full object-contain", alt = "Logo" }: SystemLogoProps) => {
  const { logoUrl, _loaded } = useBranding();
  const [imgError, setImgError] = useState(false);
  const src = imgError ? hdaLogoFallback : (logoUrl || hdaLogoFallback);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
      style={{ opacity: _loaded ? 1 : 0, transition: "opacity 0.3s ease" }}
    />
  );
};

export default SystemLogo;
