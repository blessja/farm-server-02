import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function SectionCard({ title, subtitle, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: "#fffaf1",
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddcfb7",
    shadowColor: "#8a785d",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  header: {
    marginBottom: 12,
    gap: 4,
  },
  title: {
    color: "#1d3828",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "#5f655c",
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    gap: 10,
  },
});
