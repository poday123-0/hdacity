import { useBranding } from "@/hooks/use-branding";
import hdaLogoFallback from "@/assets/hda-logo.png";
import { useState } from "react";

interface SystemLogoProps {
  className?: string;
  alt?: string;
}

const SystemLogo = ({ className = "w-full h-full object-contain", alt = "Logo" }: SystemLogoProps) => {
  const { logoUrl } = useBranding();
  const [imgError, setImgError] = useState(false);
  const src = imgError ? hdaLogoFallback : (logoUrl || hdaLogoFallback);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
      style={{ opacity: logoUrl === null && !imgError ? 0.01 : 1, transition: "opacity 0.3s ease" }}
    />
  );
};

export default SystemLogo;
