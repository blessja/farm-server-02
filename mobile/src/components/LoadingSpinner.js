import React, { useEffect, useRef } from "react";
import { View, Animated, ActivityIndicator, Platform } from "react-native";

export default function LoadingSpinner({
  size = "large",
  color = "#10b981",
  style = {},
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
        ...style,
      }}
      className="items-center justify-center"
    >
      <ActivityIndicator size={size} color={color} />
    </Animated.View>
  );
}
