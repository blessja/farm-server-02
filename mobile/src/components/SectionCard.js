import React from "react";
import { Text, View } from "react-native";

export default function SectionCard({
  title,
  subtitle,
  children,
  fullWidth = false,
  flat = false,
  nativeID,
  eyebrow,
  headerRight,
}) {
  return (
    <View
      nativeID={nativeID}
      className={flat ? "w-full" : "rounded-3xl bg-white p-4 border border-gray-100 shadow-sm"}
      style={
        fullWidth
          ? { marginHorizontal: -16, paddingHorizontal: 8 }
          : undefined
      }
    >
      <View className="mb-3 gap-1">
        {eyebrow ? (
          <Text
            style={{
              color: "#244d3b",
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        {eyebrow || headerRight ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              className="text-gray-900 text-lg font-extrabold"
              style={{
                fontFamily: "Georgia",
                fontSize: eyebrow ? 34 : undefined,
                fontWeight: eyebrow ? "500" : undefined,
              }}
            >
              {title}
            </Text>
            {headerRight}
          </View>
        ) : (
          <Text className="text-gray-900 text-lg font-extrabold">{title}</Text>
        )}
        {subtitle ? (
          <Text
            className="text-gray-400 text-[13px] leading-5"
            style={
              eyebrow
                ? {
                    fontFamily: "Georgia",
                    fontSize: 14,
                  }
                : undefined
            }
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View className="gap-2.5">{children}</View>
    </View>
  );
}
