import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "farm-cache";

function key(name) {
  return `${PREFIX}-${name}`;
}

export async function getCached(name) {
  try {
    const raw = await AsyncStorage.getItem(key(name));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCache(name, data) {
  try {
    await AsyncStorage.setItem(key(name), JSON.stringify(data));
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
