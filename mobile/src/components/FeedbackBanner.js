import React from "react";
import { Text, View } from "react-native";

export default function FeedbackBanner({ type = "info", message }) {
  if (!message) return null;

  const isError = type === "error";

  return (
    <View
      className={`rounded-xl px-3.5 py-3 ${
        isError ? "bg-red-50 border border-red-200" : "bg-farm-50 border border-farm-200"
      }`}
    >
      <Text
        className={`text-sm font-semibold leading-5 ${
          isError ? "text-red-700" : "text-farm-800"
        }`}
      >
        {message}
      </Text>
    </View>
  );
}
