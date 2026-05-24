import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import FeedbackBanner from "../components/FeedbackBanner";
import { useAsyncData } from "../hooks/useAsyncData";

export default function BlocksScreen({ sharedState }) {
  const { data, loading, error, refresh } = useAsyncData(() => api.getBlocks(), []);

  return (
    <ScreenScroll refreshing={loading} onRefresh={refresh}>
      <SectionCard
        title="Blocks"
        subtitle="Loaded from `/api/blocks`. Tap one to make it the active context for the row workflow screens."
      >
        {loading && !data ? <ActivityIndicator color="#294d39" /> : null}
        {Array.isArray(data) ? (
          <View style={styles.grid}>
            {data.map((blockName) => {
              const active = sharedState.selectedBlock === blockName;
              return (
                <Pressable
                  key={blockName}
                  style={[styles.blockCard, active && styles.activeCard]}
                  onPress={() => {
                    sharedState.setSelectedBlock(blockName);
                    sharedState.setSelectedRow("");
                  }}
                >
                  <Text style={[styles.blockName, active && styles.activeText]}>
                    {blockName}
                  </Text>
                  <Text style={[styles.blockHint, active && styles.activeSubtext]}>
                    {active ? "Active block" : "Set as active"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <FeedbackBanner type="error" message={error} />
      </SectionCard>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
  },
  blockCard: {
    borderRadius: 18,
    backgroundColor: "#f6ecd9",
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0d1b7",
  },
  activeCard: {
    backgroundColor: "#294d39",
    borderColor: "#294d39",
  },
  blockName: {
    color: "#203428",
    fontSize: 18,
    fontWeight: "800",
  },
  activeText: {
    color: "#fefcf7",
  },
  blockHint: {
    marginTop: 6,
    color: "#6d6a61",
    fontSize: 13,
  },
  activeSubtext: {
    color: "#dce8dd",
  },
});
