import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "farm-cache";

function key(name) {
  return `${PREFIX}-${name}`;
}

export async function getCached(name) {
  try {
    const raw = await AsyncStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ?? parsed;
  } catch {
    return null;
  }
}

export async function getCachedWithTimestamp(name) {
  try {
    const raw = await AsyncStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "ts" in parsed) {
      return { data: parsed.data, ts: parsed.ts };
    }
    return { data: parsed, ts: 0 };
  } catch {
    return null;
  }
}

export async function setCache(name, data) {
  try {
    const envelope = { data, ts: Date.now() };
    await AsyncStorage.setItem(key(name), JSON.stringify(envelope));
  } catch {
    // silently ignore write failures
  }
}

export async function clearCache(name) {
  try {
    await AsyncStorage.removeItem(key(name));
  } catch {
    // silently ignore
  }
}

export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(`${PREFIX}-`));
    if (cacheKeys.length) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // silently ignore
  }
}
