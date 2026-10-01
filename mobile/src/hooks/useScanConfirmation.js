import { Vibration } from "react-native";
import { useAudioPlayer } from "expo-audio";

// A short 880 Hz WAV chime. An inline data URI keeps scan confirmation fast
// and available even when the device has no network connection.
const SCAN_CHIME =
  "data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUABAACAgYSGg311cHR/jZiYjHhlXGR7l6usmHZWSFN1nr3ApXdKNEBso83VtXpCJzRkoc/YuYBHKDFfnMzZvoZLKS9alsnawotQKixVkcXaxZFVLCpQi8LayZZaLylLhr7ZzJxfMShHgLnYz6FkNCdCerXX0aZqNyY+dbDW1KtvOyY7b6vU1rB1PiY3aqbR17V6Qic0ZKHP2LmARygxX5zM2b6GSykvWpbJ2sKLUCosVZHF2sWRVSwqUIvC2smWWi8pS4a+2cycXzEoR4C52M+hZDQnQnq119GmajcmPnWw1tSrbzsmO2+r1NawdT4mN2qm0de1ekQqOGafyNCzgE81PmWXvcawhFhARWWQsr2rh2FLTWaKqLOmiWlVVWiFnqiginBfXmyClp6ZiXZpaHGAjpSRh3tzcXd/h4qIg357fH6AgQ==";

export function useScanConfirmation() {
  const player = useAudioPlayer(SCAN_CHIME);

  return () => {
    // Haptic feedback still confirms the scan if a device's audio policy
    // prevents the very short chime from playing.
    Vibration.vibrate(30);
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // A successful scan must never fail because audio is unavailable.
    }
  };
}
