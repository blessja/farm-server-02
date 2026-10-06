import React, { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import GlenOakLogo from "./GlenOakLogo";

export default function SplashScreen() {
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GlenOakLogo width={160} height={160} />

          <Animated.View
            style={{
              transform: [{ rotate: spin }],
              position: "absolute",
              width: 192,
              height: 192,
              borderRadius: 96,
              borderWidth: 4,
              borderColor: "transparent",
              borderTopColor: "#fff",
              borderRightColor: "#fff",
            }}
          />
        </Animated.View>

        <View style={{ position: "absolute", bottom: 48, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 8 }}>Glen Oak</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
            Preparing mobile workspace...
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 1, 0.3, 0.3],
                }),
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#fff",
                marginHorizontal: 4,
              }}
            />
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 0.3, 1, 0.3],
                }),
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#fff",
                marginHorizontal: 4,
              }}
            />
            <Animated.View
              style={{
                opacity: spinAnim.interpolate({
                  inputRange: [0, 0.3, 0.6, 1],
                  outputRange: [0.3, 0.3, 0.3, 1],
                }),
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#fff",
                marginHorizontal: 4,
              }}
            />
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
