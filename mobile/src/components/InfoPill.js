import React from "react";
import { Text, View } from "react-native";

export default function InfoPill({ label, value }) {
  return (
    <View className="min-w-24 rounded-2xl bg-gray-50 border border-gray-100 px-3 py-2.5 gap-1">
      <Text className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
        {label}
      </Text>
      <Text className="text-gray-900 text-base font-extrabold">{value}</Text>
    </View>
  );
}
