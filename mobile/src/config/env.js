const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
const configuredDeviceName = process.env.EXPO_PUBLIC_DEVICE_NAME;

export const API_BASE_URL =
  configuredUrl && configuredUrl.trim().length > 0
    ? configuredUrl.trim().replace(/\/$/, "")
    : "http://localhost:8080";

export const DEVICE_NAME =
  configuredDeviceName && configuredDeviceName.trim().length > 0
    ? configuredDeviceName.trim()
    : "farm-mobile-device";
