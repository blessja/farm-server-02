import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function SelectField({
  label,
  value,
  placeholder,
  options = [],
  onSelect,
  emptyMessage = "No options available",
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen((current) => !current)}>
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          {!options.length ? (
            <Text style={styles.empty}>{emptyMessage}</Text>
          ) : (
            options.map((option, index) => {
              const selected = value === option.value;
              const optionKey =
                option.value === null || typeof option.value === "undefined"
                  ? `option-${index}`
                  : `${option.value}-${index}`;
              return (
                <Pressable
                  key={optionKey}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: "#415247",
    fontSize: 13,
    fontWeight: "700",
  },
  trigger: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9ccb4",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerText: {
    color: "#1f2d22",
    fontSize: 15,
    flex: 1,
  },
  placeholder: {
    color: "#8b8f88",
  },
  chevron: {
    color: "#5f655c",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 10,
  },
  menu: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9ccb4",
    backgroundColor: "#fffaf1",
    overflow: "hidden",
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#efe4cf",
  },
  optionSelected: {
    backgroundColor: "#294d39",
  },
  optionText: {
    color: "#1f2d22",
    fontSize: 14,
    fontWeight: "700",
  },
  optionTextSelected: {
    color: "#fefcf7",
  },
  empty: {
    color: "#6a675f",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
