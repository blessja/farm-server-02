import React from "react";
import { Text, TouchableOpacity } from "react-native";

export default function ActionButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={{
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "secondary" ? "#f3f4f6" : "#16a34a",
        borderWidth: tone === "secondary" ? 1 : 0,
        borderColor: tone === "secondary" ? "#e5e7eb" : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "800",
          color: tone === "secondary" ? "#374151" : "#fff",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
