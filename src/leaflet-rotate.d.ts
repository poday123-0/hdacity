declare module "leaflet-rotate" {
  // Side-effect import that patches L.Map with rotation support
}

declare namespace L {
  interface MapOptions {
    rotate?: boolean;
    touchRotate?: boolean;
    bearing?: number;
  }
  interface Map {
    setBearing(bearing: number): this;
    getBearing(): number;
  }
}
