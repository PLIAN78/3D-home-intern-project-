/**
 * Local tangent-plane projection around an origin (accurate to well under a
 * metre across a few kilometres — plenty for a subdivision).
 *
 * Plan metres: x = east, y = north. The 3D world uses x = east, z = −north.
 */

/** Google Street View at a point (opens the nearest panorama). */
export function streetViewUrl(p: LatLng): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const M_PER_DEG_LAT = 111_132.954;

export function metresPerDegree(lat: number) {
  return { lat: M_PER_DEG_LAT - 559.822 * Math.cos((2 * lat * Math.PI) / 180), lng: (Math.PI / 180) * 6_378_137 * Math.cos((lat * Math.PI) / 180) };
}

export function toLocal(origin: LatLng, p: LatLng): { x: number; y: number } {
  const m = metresPerDegree(origin.lat);
  return { x: (p.lng - origin.lng) * m.lng, y: (p.lat - origin.lat) * m.lat };
}

export function toLatLng(origin: LatLng, p: { x: number; y: number }): LatLng {
  const m = metresPerDegree(origin.lat);
  return { lat: origin.lat + p.y / m.lat, lng: origin.lng + p.x / m.lng };
}

/** Google Maps link for a point (opens satellite view). */
export function googleMapsUrl(p: LatLng, zoom = 19) {
  return `https://www.google.com/maps/@${p.lat.toFixed(6)},${p.lng.toFixed(6)},${zoom}z/data=!3m1!1e3`;
}
