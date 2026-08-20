import React from "react";
import { Text, TextInput, View } from "react-native";

export default function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "none",
  secureTextEntry = false,
  readOnly = false,
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-gray-600 text-xs font-bold">{label}</Text>
      <TextInput
        className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-gray-900 text-[15px]"
        value={value}
        onChangeText={readOnly ? undefined : onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        readOnly={readOnly}
        editable={!readOnly}
        style={readOnly ? { backgroundColor: "#f9fafb", color: "#6b7280" } : undefined}
      />
    </View>
  );
}
