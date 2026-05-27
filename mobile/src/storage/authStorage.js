import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "farm-mobile-auth-token";
const SUPERVISOR_SESSION_KEY = "farm-mobile-supervisor-session";
const LAST_SUPERVISOR_NAME_KEY = "farm-mobile-last-supervisor-name";

async function canUseSecureStore() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch (error) {
    return false;
  }
}

export async function getAuthToken() {
  if (await canUseSecureStore()) {
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    if (token) {
      return token;
    }
  }

  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token) {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }

  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function clearAuthToken() {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }

  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function getSupervisorSession() {
  const raw = await AsyncStorage.getItem(SUPERVISOR_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export async function setSupervisorSession(session) {
  await AsyncStorage.setItem(
    SUPERVISOR_SESSION_KEY,
    JSON.stringify({
      supervisorName: session?.supervisorName || "",
      authEnabled: Boolean(session?.authEnabled),
      signedInAt: new Date().toISOString(),
    })
  );
}

export async function clearSupervisorSession() {
  await AsyncStorage.removeItem(SUPERVISOR_SESSION_KEY);
}

export async function getLastSupervisorName() {
  return (await AsyncStorage.getItem(LAST_SUPERVISOR_NAME_KEY)) || "";
}

export async function setLastSupervisorName(supervisorName) {
  await AsyncStorage.setItem(
    LAST_SUPERVISOR_NAME_KEY,
    String(supervisorName || "").trim()
  );
}
