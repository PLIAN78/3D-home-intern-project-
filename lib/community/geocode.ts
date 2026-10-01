import type { LatLng } from "./geo";

/**
 * Approximate a community's location from street names on its site plan,
 * using OpenStreetMap Nominatim (≤ 1 request/second, identified user agent).
 */

const USER_AGENT = "HomeStudio/0.1 (+https://github.com/PLIAN78/3D-home-intern-project-)";

export async function geocodeQuery(q: string): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { lat: string; lon: string }[];
  return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
}

/** Median location of several named streets in a city (robust to one bad hit). */
export async function locateByStreets(streets: string[], city: string, max = 5): Promise<LatLng | null> {
  const unique = [...new Set(streets.map((s) => s.replace(/\s+/g, " ").trim()))].slice(0, max);
  const hits: LatLng[] = [];
  for (const s of unique) {
    const hit = await geocodeQuery(`${s}, ${city}, Ontario`).catch(() => null);
    if (hit) hits.push(hit);
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (!hits.length) return null;
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const m = { lat: med(hits.map((h) => h.lat)), lng: med(hits.map((h) => h.lng)) };
  // Drop hits more than ~5 km from the median (same street name in another town), re-average.
  const near = hits.filter((h) => Math.abs(h.lat - m.lat) < 0.05 && Math.abs(h.lng - m.lng) < 0.07);
  return { lat: near.reduce((a, h) => a + h.lat, 0) / near.length, lng: near.reduce((a, h) => a + h.lng, 0) / near.length };
}
