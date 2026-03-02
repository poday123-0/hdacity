import { useBranding } from "@/hooks/use-branding";
import hdaLogoFallback from "@/assets/hda-logo.png";

interface SystemLogoProps {
  className?: string;
  alt?: string;
}

const SystemLogo = ({ className = "w-full h-full object-contain", alt = "Logo" }: SystemLogoProps) => {
  const { logoUrl } = useBranding();
  return <img src={logoUrl || hdaLogoFallback} alt={alt} className={className} />;
};

export default SystemLogo;
