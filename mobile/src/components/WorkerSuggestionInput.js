import React, { useEffect, useState } from "react";
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { searchWorkers, getWorkerById } from "../../workers-data";

export default function WorkerSuggestionInput({
  label = "Worker ID",
  workerID,
  workerName,
  onSelect,
  placeholder = "e.g. 1024",
}) {
  const [query, setQuery] = useState(workerID || "");
  const [isOpen, setIsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    if (workerID === "" || workerID == null) {
      setQuery("");
      setIsOpen(false);
    }
  }, [workerID]);

  const suggestions = query.trim()
    ? searchWorkers(query.trim()).slice(0, 8)
    : [];

  function handleTextChange(text) {
    setQuery(text);
    onSelect({ workerID: text, workerName: "" });
    if (text.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }

  function handleSelectSuggestion(worker) {
    setQuery(worker.workerID);
    onSelect({ workerID: worker.workerID, workerName: worker.name });
    setIsOpen(false);
  }

  async function openScanner() {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) return;
    }
    setHasScanned(false);
    setScannerOpen(true);
  }

  function handleScan(result) {
    if (hasScanned) return;
    setHasScanned(true);
    const rawValue = typeof result?.data === "string" ? result.data : "";

    let workerData = null;
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed?.workerID && parsed?.workerName) {
        workerData = {
          workerID: String(parsed.workerID).trim(),
          workerName: parsed.workerName.trim(),
        };
      }
    } catch {
      // not JSON
    }

    if (!workerData) {
      const found = getWorkerById(rawValue.trim());
      if (found) {
        workerData = { workerID: found.workerID, workerName: found.name };
      } else {
        workerData = { workerID: rawValue, workerName: "" };
      }
    }

    setQuery(workerData.workerID);
    onSelect(workerData);
    setScannerOpen(false);
  }

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <TextInput
            style={{
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              backgroundColor: "#fff",
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: "#111827",
            }}
            value={query}
            onChangeText={handleTextChange}
            placeholder={placeholder}
            placeholderTextColor="#9ca3af"
            onFocus={() => {
              if (query.trim().length > 0) setIsOpen(true);
            }}
          />
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              borderRadius: 12,
              backgroundColor: "#16a34a",
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            onPress={openScanner}
          >
            <Text
              style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}
            >
              Scan
            </Text>
          </TouchableOpacity>
        </View>

        {isOpen && suggestions.length > 0 && (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              backgroundColor: "#fff",
              maxHeight: 200,
              overflow: "hidden",
            }}
          >
            {suggestions.map((item) => (
              <TouchableOpacity
                key={item.workerID}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}
                onPress={() => handleSelectSuggestion(item)}
              >
                <Text
                  style={{
                    color: "#111827",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {item.name}
                </Text>
                <Text
                  style={{
                    color: "#9ca3af",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  ID {item.workerID}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Modal visible={scannerOpen} animationType="slide">
        <View className="flex-1 bg-gray-900 px-4 pt-16 pb-8">
          <Text className="text-white text-2xl font-extrabold">
            Scan barcode or QR code
          </Text>
          <Text className="mt-2 text-gray-300 text-sm leading-5">
            Point the camera at a worker badge.
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
            style={{
              marginTop: 16,
              borderRadius: 16,
              backgroundColor: "#1f2937",
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#374151",
            }}
            onPress={() => setScannerOpen(false)}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 15,
                fontWeight: "800",
              }}
            >
              Close scanner
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
