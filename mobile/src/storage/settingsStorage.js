import AsyncStorage from "@react-native-async-storage/async-storage";

const ROW_ADVANCE_KEY = "settings.rowAdvance";

export async function getRowAdvanceSettings() {
  try {
    const raw = await AsyncStorage.getItem(ROW_ADVANCE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setRowAdvanceSettings(enabled, direction) {
  try {
    await AsyncStorage.setItem(
      ROW_ADVANCE_KEY,
      JSON.stringify({
        enabled: Boolean(enabled),
        direction: direction === "up" || direction === "down" ? direction : "follow",
      })
    );
  } catch {
    // Non-critical preference; ignoring write failures is fine.
  }
}