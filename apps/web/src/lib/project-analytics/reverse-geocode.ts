const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/reverse';
const REQUEST_TIMEOUT_MS = 4000;
const USER_AGENT = 'Neurons/1.0 (analytics reverse-geocode)';

export type ReverseGeocodeResult = {
  country: string | null;
  state: string | null;
  city: string | null;
};

const EMPTY_RESULT: ReverseGeocodeResult = { country: null, state: null, city: null };

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function reverseGeocodeOne(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = `${NOMINATIM_BASE}?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) return EMPTY_RESULT;

    const data = (await res.json()) as { address?: Record<string, string> };
    const address = data?.address;
    if (!address) return EMPTY_RESULT;

    return {
      country: address.country ?? null,
      state: address.state ?? null,
      city:
        address.city ??
        address.town ??
        address.village ??
        address.hamlet ??
        address.county ??
        null,
    };
  } catch {
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timer);
  }
}

export async function batchReverseGeocode(
  pairs: { latitude: number; longitude: number }[],
): Promise<Map<string, ReverseGeocodeResult>> {
  const unique = new Map<string, { lat: number; lng: number }>();

  for (const { latitude, longitude } of pairs) {
    const key = coordKey(latitude, longitude);
    if (!unique.has(key)) {
      unique.set(key, { lat: latitude, lng: longitude });
    }
  }

  const entries = Array.from(unique.entries());
  const results = await Promise.allSettled(
    entries.map(([, { lat, lng }]) => reverseGeocodeOne(lat, lng)),
  );

  const map = new Map<string, ReverseGeocodeResult>();
  for (let i = 0; i < entries.length; i++) {
    const result = results[i];
    map.set(
      entries[i][0],
      result.status === 'fulfilled' ? result.value : EMPTY_RESULT,
    );
  }

  return map;
}

export function makeCoordKey(lat: number, lng: number): string {
  return coordKey(lat, lng);
}
