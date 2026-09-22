import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import GlenOakLogo from "./GlenOakLogo";
import { useLanguage } from "../i18n";

const LOGO_SIZE = 170;

export default function SplashScreen() {
  const { t } = useLanguage();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  }, [scaleAnim, opacityAnim, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <LinearGradient
      colors={["#10b981", "#059669", "#047857"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <View className="relative flex-1 w-full">
        {/* Centered logo */}
        <Animated.View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
        >
          <View style={{ width: LOGO_SIZE, height: LOGO_SIZE, justifyContent: "center", alignItems: "center" }}>
            {/* Glen Oak Logo */}
            <GlenOakLogo width={LOGO_SIZE} height={LOGO_SIZE} />

            {/* Animated spinner ring centered over the logo */}
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: LOGO_SIZE / 2,
                borderWidth: 5,
                borderColor: "transparent",
                borderTopColor: "#ffffff",
                borderRightColor: "#ffffff",
                transform: [{ rotate: spin }],
              }}
            />
          </View>
        </Animated.View>

        {/* Loading Text pinned near the bottom */}
        <View className="absolute inset-x-0 bottom-12 items-center">
          <Text className="text-white text-2xl font-bold mb-2">Glen Oak</Text>
          <Text className="text-white/80 text-sm">
            {t("splash.preparing")}
          </Text>

          {/* Loading dots animation */}
          <View className="flex-row items-center mt-4">
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 1, 0.3, 0.3],
                }),
              }}
              className="w-2 h-2 bg-white rounded-full mx-1"
            />
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 0.3, 1, 0.3],
                }),
              }}
              className="w-2 h-2 bg-white rounded-full mx-1"
            />
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 0.3, 0.3, 1],
                }),
              }}
              className="w-2 h-2 bg-white rounded-full mx-1"
            />
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}