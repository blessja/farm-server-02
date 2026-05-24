import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function TabBar({ tabs, activeTab, onChange }) {
  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              style={[styles.item, active && styles.activeItem]}
              onPress={() => onChange(tab.key)}
            >
              <Text style={[styles.label, active && styles.activeLabel]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 18,
    backgroundColor: "#f4efe3",
  },
  bar: {
    flexDirection: "row",
    borderRadius: 22,
    backgroundColor: "#e9dcc4",
    padding: 6,
  },
  item: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  activeItem: {
    backgroundColor: "#294d39",
  },
  label: {
    color: "#5f5a4c",
    fontSize: 12,
    fontWeight: "800",
  },
  activeLabel: {
    color: "#fefcf7",
  },
});
