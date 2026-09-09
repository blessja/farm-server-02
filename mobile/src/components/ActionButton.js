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
        backgroundColor: tone === "secondary" ? "#E5ECE4" : "#2D7A55",
        borderWidth: tone === "secondary" ? 1 : 0,
        borderColor: tone === "secondary" ? "#D4DFD3" : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "800",
          color: tone === "secondary" ? "#374236" : "#fff",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
