import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
    <View style={{ gap: 6 }}>
      <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.7}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
          backgroundColor: "#fff",
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={{ fontSize: 15, flex: 1, color: value ? "#111827" : "#9ca3af" }}>
          {value || placeholder}
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 12, fontWeight: "800", marginLeft: 10 }}>
          {open ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>

      {open ? (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", overflow: "hidden" }}>
          {!options.length ? (
            <Text style={{ color: "#9ca3af", fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 }}>{emptyMessage}</Text>
          ) : (
            options.map((option, index) => {
              const selected = value === option.value;
              const optionKey =
                option.value === null || typeof option.value === "undefined"
                  ? `option-${index}`
                  : `${option.value}-${index}`;
              return (
                <TouchableOpacity
                  key={optionKey}
                  activeOpacity={0.7}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderTopColor: "#f3f4f6",
                    backgroundColor: selected ? "#16a34a" : "#fff",
                  }}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={{ color: selected ? "#fff" : "#111827", fontSize: 14, fontWeight: "700" }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}
