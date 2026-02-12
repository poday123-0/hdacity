import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom blue marker for pickup
const pickupIcon = new L.DivIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#40A3DB;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: "",
});

// Malé, Maldives center
const MALE_CENTER: [number, number] = [4.1755, 73.5093];

const MaldivesMap = () => {
  return (
    <MapContainer
      center={MALE_CENTER}
      zoom={15}
      scrollWheelZoom={true}
      zoomControl={false}
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={MALE_CENTER} icon={pickupIcon}>
        <Popup>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Your location</span>
          <br />
          <span style={{ fontSize: 12, color: "#666" }}>Malé, Maldives</span>
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default MaldivesMap;
