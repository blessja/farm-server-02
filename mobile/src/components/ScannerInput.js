import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ScannerInput({
  label,
  value,
  onChangeText,
  onScan,
  placeholder,
  autoCapitalize = "none",
  keyboardType,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);

  async function openScanner() {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        return;
      }
    }

    setHasScanned(false);
    setIsOpen(true);
  }

  function parseWorkerPayload(rawValue) {
    if (typeof rawValue !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue);
      if (
        parsed &&
        typeof parsed.workerID !== "undefined" &&
        typeof parsed.workerName === "string"
      ) {
        return {
          workerID: String(parsed.workerID).trim(),
          workerName: parsed.workerName.trim(),
        };
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function handleScan(result) {
    if (hasScanned) return;
    setHasScanned(true);
    const rawValue = typeof result?.data === "string" ? result.data : "";
    const workerData = parseWorkerPayload(rawValue);

    if (typeof onScan === "function") {
      onScan({
        rawValue,
        textValue: workerData?.workerID || rawValue,
        workerData,
      });
    } else {
      onChangeText(workerData?.workerID || rawValue);
    }

    setIsOpen(false);
  }

  return (
    <>
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#8b8f88"
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
          />
          <Pressable style={styles.scanButton} onPress={openScanner}>
            <Text style={styles.scanLabel}>Scan</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={isOpen} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Scan barcode or QR code</Text>
          <Text style={styles.modalSubtitle}>
            Point the camera at a worker badge or row label.
          </Text>
          <View style={styles.cameraFrame}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "qr",
                  "code128",
                  "code39",
                  "ean13",
                  "ean8",
                  "upc_a",
                  "upc_e",
                ],
              }}
              onBarcodeScanned={handleScan}
            />
          </View>
          <Pressable style={styles.closeButton} onPress={() => setIsOpen(false)}>
            <Text style={styles.closeLabel}>Close scanner</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: "#415247",
    fontSize: 13,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9ccb4",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#1f2d22",
    fontSize: 15,
  },
  scanButton: {
    borderRadius: 14,
    backgroundColor: "#294d39",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scanLabel: {
    color: "#fefcf7",
    fontWeight: "800",
    fontSize: 13,
  },
  modal: {
    flex: 1,
    backgroundColor: "#122319",
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: 30,
  },
  modalTitle: {
    color: "#fefcf7",
    fontSize: 24,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 8,
    color: "#c4d5c6",
    fontSize: 14,
    lineHeight: 20,
  },
  cameraFrame: {
    flex: 1,
    marginTop: 24,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#3b5944",
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: "#e6dac3",
    paddingVertical: 14,
    alignItems: "center",
  },
  closeLabel: {
    color: "#284132",
    fontSize: 15,
    fontWeight: "800",
  },
});
