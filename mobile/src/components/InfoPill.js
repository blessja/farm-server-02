import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function InfoPill({ label, value }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 96,
    borderRadius: 18,
    backgroundColor: "#efe4cf",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  label: {
    color: "#786247",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  value: {
    color: "#203428",
    fontSize: 16,
    fontWeight: "800",
  },
});
