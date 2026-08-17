import React from "react";
import { Text, View } from "react-native";

export default function SectionCard({ title, subtitle, children }) {
  return (
    <View className="rounded-3xl bg-white p-4 border border-gray-100 shadow-sm">
      <View className="mb-3 gap-1">
        <Text className="text-gray-900 text-lg font-extrabold">{title}</Text>
        {subtitle ? (
          <Text className="text-gray-400 text-[13px] leading-5">{subtitle}</Text>
        ) : null}
      </View>
      <View className="gap-2.5">{children}</View>
    </View>
  );
}
