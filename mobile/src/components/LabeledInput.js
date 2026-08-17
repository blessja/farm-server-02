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
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-gray-600 text-xs font-bold">{label}</Text>
      <TextInput
        className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-gray-900 text-[15px]"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}
