import React, { useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
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
      <View className="gap-1.5">
        <Text className="text-gray-600 text-xs font-bold">{label}</Text>
        <View className="flex-row gap-2.5 items-center">
          <TextInput
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-gray-900 text-[15px]"
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
          />
          <TouchableOpacity
            activeOpacity={0.7}
            style={{ borderRadius: 12, backgroundColor: "#2D7A55", paddingHorizontal: 14, paddingVertical: 12 }}
            onPress={openScanner}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={isOpen} animationType="slide">
        <View className="flex-1 bg-gray-900 px-4 pt-16 pb-8">
          <Text className="text-white text-2xl font-extrabold">Scan barcode or QR code</Text>
          <Text className="mt-2 text-gray-300 text-sm leading-5">
            Point the camera at a worker badge or row label.
          </Text>
          <View className="flex-1 mt-6 rounded-3xl overflow-hidden border border-gray-700">
            <CameraView
              style={{ flex: 1 }}
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
          <TouchableOpacity
            activeOpacity={0.7}
            style={{ marginTop: 16, borderRadius: 16, backgroundColor: "#1f2937", paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#374151" }}
            onPress={() => setIsOpen(false)}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Close scanner</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
