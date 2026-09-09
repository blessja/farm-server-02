import React, { useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";

const COMPACT_BREAKPOINT = 500;

export default function TabBar({ tabs, activeTab, onChange }) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = width < COMPACT_BREAKPOINT;

  const activeTabInfo = tabs.find((tab) => tab.key === activeTab);

  function selectTab(key) {
    onChange(key);
    setMenuOpen(false);
  }

  if (compact) {
    return (
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, backgroundColor: "#F4F7F3", borderTopWidth: 1, borderTopColor: "#D4DFD3" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setMenuOpen(true)}
            style={{
              borderRadius: 12,
              backgroundColor: "#E5ECE4",
              borderWidth: 1,
              borderColor: "#D4DFD3",
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: "800", color: "#374151" }}>☰</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827" }}>
              {activeTabInfo ? activeTabInfo.label : ""}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setMenuOpen(true)}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#16a34a" }}>Menu</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(17,24,39,0.45)" }} onPress={() => setMenuOpen(false)}>
            <View
              style={{
                marginTop: "auto",
                marginHorizontal: 16,
                marginBottom: 92,
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              {tabs.map((tab, idx) => {
                const active = tab.key === activeTab;

                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.7}
                    onPress={() => selectTab(tab.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      backgroundColor: active ? "#f0fdf4" : "#fff",
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: "#f3f4f6",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: active ? "800" : "600", color: active ? "#16a34a" : "#374151" }}>
                      {tab.label}
                    </Text>
                    {active ? (
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#16a34a" }}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, backgroundColor: "#F4F7F3", borderTopWidth: 1, borderTopColor: "#D4DFD3" }}>
      <View style={{ flexDirection: "row", borderRadius: 16, backgroundColor: "#E5ECE4", padding: 6 }}>
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
                backgroundColor: active ? "#2D7A55" : "transparent",
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: "800",
                color: active ? "#fff" : "#627060",
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
