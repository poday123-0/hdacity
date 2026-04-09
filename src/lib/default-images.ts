import defaultVehicleImg from "@/assets/default-vehicle.png";
import defaultIdFrontImg from "@/assets/default-id-front.png";
import defaultIdBackImg from "@/assets/default-id-back.png";
import defaultLicenseFrontImg from "@/assets/default-license-front.png";
import defaultLicenseBackImg from "@/assets/default-license-back.png";
import defaultTaxiPermitImg from "@/assets/default-taxi-permit.png";
import defaultVehicleRegistrationImg from "@/assets/default-vehicle-registration.png";
import defaultVehicleInsuranceImg from "@/assets/default-vehicle-insurance.png";

/** Bundled fallback image for vehicles without a photo */
export const DEFAULT_VEHICLE_IMAGE = defaultVehicleImg;

/** Document-specific default images */
export const DEFAULT_DOC_IMAGES: Record<string, string> = {
  "ID Card (Front)": defaultIdFrontImg,
  "ID Card (Back)": defaultIdBackImg,
  "License (Front)": defaultLicenseFrontImg,
  "License (Back)": defaultLicenseBackImg,
  "Taxi Permit (Front)": defaultTaxiPermitImg,
  "Taxi Permit (Back)": defaultTaxiPermitImg,
  "Vehicle Registration": defaultVehicleRegistrationImg,
  "Registration": defaultVehicleRegistrationImg,
  "Vehicle Insurance": defaultVehicleInsuranceImg,
  "Insurance": defaultVehicleInsuranceImg,
  "Vehicle Image": defaultVehicleImg,
};

/** Get the appropriate default image for a document label */
export const getDefaultDocImage = (label: string): string => {
  return DEFAULT_DOC_IMAGES[label] || defaultVehicleImg;
};
