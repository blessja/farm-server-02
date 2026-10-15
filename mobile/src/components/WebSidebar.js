import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import GlenOakLogo from "./GlenOakLogo";
import { useLanguage } from "../i18n";

const tabIcons = {
  dashboard: "⌂",
  daywork: "▤",
  working: "◉",
  move: "↔",
  clock: "◷",
  fast: "✦",
  totals: "▦",
  queue: "☷",
};

export default function WebSidebar({
  tabs,
  activeTab,
  onChange,
  supervisorName,
  onLogout,
}) {
  const { t } = useLanguage();

  return (
    <View
      style={{
        width: 264,
        flexShrink: 0,
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingTop: 28,
        paddingBottom: 22,
        backgroundColor: "#153d32",
        borderRightWidth: 1,
        borderRightColor: "#285345",
      }}
    >
      <View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 4,
            marginBottom: 32,
          }}
        >
          <GlenOakLogo width={46} height={46} />
          <View>
            <Text style={{ color: "#f7faf7", fontSize: 17, fontWeight: "800" }}>
              Glen Oak
            </Text>
            <Text style={{ color: "#aec5b8", fontSize: 11, marginTop: 3 }}>
              Farm Operations
            </Text>
          </View>
        </View>

        <Text
          style={{
            marginBottom: 12,
            marginLeft: 12,
            color: "#91ad9f",
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 1.5,
          }}
        >
          {t("sidebar.workspace")}
        </Text>

        <View style={{ gap: 6 }}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const labelKey = tab.key === "dashboard" ? "home" : tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                activeOpacity={0.8}
                onPress={() => onChange(tab.key)}
                style={{
                  minHeight: 46,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: active ? "#285846" : "transparent",
                  borderWidth: 1,
                  borderColor: active ? "#3b745b" : "transparent",
                }}
              >
                <Text
                  style={{
                    width: 22,
                    color: active ? "#c5ed9a" : "#a8c0b2",
                    fontSize: 19,
                    textAlign: "center",
                  }}
                >
                  {tabIcons[tab.key]}
                </Text>
                <Text
                  style={{
                    color: active ? "#ffffff" : "#d1ded5",
                    fontSize: 14,
                    fontWeight: active ? "800" : "600",
                  }}
                >
                  {t(`tab.${labelKey}`)}
                </Text>
                {active ? (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      marginLeft: "auto",
                      borderRadius: 3,
                      backgroundColor: "#c5ed9a",
                    }}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: 16,
          backgroundColor: "#1e493b",
          borderWidth: 1,
          borderColor: "#315b49",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              backgroundColor: "#d8e9c8",
            }}
          >
            <Text style={{ color: "#214d3b", fontWeight: "800", fontSize: 14 }}>
              {(supervisorName || "S").trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}
            >
              {supervisorName || "Supervisor"}
            </Text>
            <Text style={{ color: "#aec5b8", fontSize: 11, marginTop: 3 }}>
              {t("sidebar.signedIn")}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={onLogout}
          style={{
            marginTop: 14,
            paddingVertical: 9,
            alignItems: "center",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#456857",
          }}
        >
          <Text style={{ color: "#d1ded5", fontSize: 12, fontWeight: "700" }}>
            {t("header.logout")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
