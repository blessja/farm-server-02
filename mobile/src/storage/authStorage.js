import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "farm-mobile-auth-token";

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
