import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import GlenOakLogo from "./GlenOakLogo";

const WINDOW_WIDTH = Dimensions.get("window").width;
const WINDOW_HEIGHT = Dimensions.get("window").height;

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
      className="flex-1 justify-center items-center"
    >
      <View className="flex-1 justify-center items-center w-full">
        {/* Logo Container */}
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
          className="items-center mb-8"
        >
          {/* Glen Oak Logo */}
          <GlenOakLogo width={160} height={160} />

          {/* Animated spinner */}
          <Animated.View
            style={{
              transform: [{ rotate: spin }],
            }}
            className="absolute w-48 h-48 rounded-full border-4 border-transparent border-t-white border-r-white"
          />
        </Animated.View>

        {/* Loading Text */}
        <View className="items-center mt-12">
          <Text className="text-white text-2xl font-bold mb-2">Glen Oak</Text>
          <Text className="text-white/80 text-sm">
            Preparing mobile workspace...
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
