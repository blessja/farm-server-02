import React from "react";
import { RefreshControl, ScrollView } from "react-native";

export default function ScreenScroll({
  children,
  refreshing = false,
  onRefresh,
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 14 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
