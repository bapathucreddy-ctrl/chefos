import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "chefos:supabase:api:";
let owner = null;
const owners = new WeakMap();
export function setCacheOwner(value) {
  owner = value;
}
export function markCacheOwner(data, value) {
  if (data && typeof data === "object") {
    owners.set(data, value);
    for (const item of Object.values(data))
      if (item && typeof item === "object") markCacheOwner(item, value);
  }
}

function keyFor(key) {
  return `${CACHE_PREFIX}${owner}:${key}`;
}

export async function readCachedValue(key, { maxAgeMs = Infinity } = {}) {
  if (!owner) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt || 0);
    if (!parsed || !("data" in parsed) || !cachedAt) return null;
    if (Date.now() - cachedAt > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeCachedValue(key, data) {
  if (
    !owner ||
    (data &&
      typeof data === "object" &&
      owners.has(data) &&
      owners.get(data) !== owner)
  )
    return;
  try {
    await AsyncStorage.setItem(
      keyFor(key),
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      }),
    );
  } catch {}
}

export async function removeCachedValue(key) {
  try {
    await AsyncStorage.removeItem(keyFor(key));
  } catch {}
}
