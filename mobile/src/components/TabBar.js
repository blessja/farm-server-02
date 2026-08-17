import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function TabBar({ tabs, activeTab, onChange }) {
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
      <View style={{ flexDirection: "row", borderRadius: 16, backgroundColor: "#f3f4f6", padding: 6 }}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              onPress={() => onChange(tab.key)}
              style={{
                flex: 1,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: active ? "#16a34a" : "transparent",
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: "800",
                color: active ? "#fff" : "#6b7280",
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
