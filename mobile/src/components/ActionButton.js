import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

export default function ActionButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}) {
  return (
    <Pressable
      style={[
        styles.button,
        tone === "secondary" ? styles.secondary : styles.primary,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.label,
          tone === "secondary" ? styles.secondaryLabel : styles.primaryLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: "#294d39",
  },
  secondary: {
    backgroundColor: "#e6dac3",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: "800",
  },
  primaryLabel: {
    color: "#fefcf7",
  },
  secondaryLabel: {
    color: "#284132",
  },
});
