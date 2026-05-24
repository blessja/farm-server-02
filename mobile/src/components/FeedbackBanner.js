import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function FeedbackBanner({ type = "info", message }) {
  if (!message) return null;

  const isError = type === "error";

  return (
    <View style={[styles.banner, isError ? styles.error : styles.success]}>
      <Text style={[styles.text, isError ? styles.errorText : styles.successText]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  success: {
    backgroundColor: "#d8eadc",
  },
  error: {
    backgroundColor: "#f2d6d0",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  successText: {
    color: "#1f4a2b",
  },
  errorText: {
    color: "#7b2518",
  },
});
