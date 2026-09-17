import React from "react";
import Svg, { Circle, Path, G, Defs, LinearGradient, Stop } from "react-native-svg";

export default function GlenOakLogo({ width = 160, height = 160 }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="leafGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#a3e635" stopOpacity="1" />
          <Stop offset="100%" stopColor="#65a30d" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Outer Circle Background */}
      <Circle cx="100" cy="100" r="95" fill="#1a5f4a" />

      {/* White Ring */}
      <Circle cx="100" cy="100" r="85" fill="none" stroke="white" strokeWidth="8" />

      {/* G Letter Shape */}
      <G>
        {/* Top curve of G */}
        <Path
          d="M 120 65 Q 95 50 75 65"
          fill="white"
          opacity="0.9"
        />
        {/* Right side of G */}
        <Path
          d="M 135 85 L 135 130 Q 135 145 120 150"
          fill="none"
          stroke="white"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Bottom curve */}
        <Path
          d="M 120 150 Q 85 155 65 135"
          fill="none"
          stroke="white"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Left side */}
        <Path
          d="M 65 135 L 65 75 Q 65 55 80 50"
          fill="none"
          stroke="white"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Inner horizontal bar of G */}
        <Path
          d="M 100 120 L 135 120"
          fill="none"
          stroke="white"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </G>

      {/* Oak Leaf */}
      <G transform="translate(115, 85)">
        {/* Leaf outline */}
        <Path
          d="M 0 -15 Q 8 -8 12 0 Q 13 8 10 15 Q 0 12 -8 8 Q -12 2 -10 -8 Q -8 -12 0 -15"
          fill="url(#leafGradient)"
          stroke="#1a3a2a"
          strokeWidth="1.5"
        />
        {/* Leaf vein - center line */}
        <Path
          d="M 0 -15 Q 2 0 0 15"
          stroke="#1a3a2a"
          strokeWidth="1"
          fill="none"
        />
        {/* Leaf vein details */}
        <Path
          d="M -2 -8 L 6 -6"
          stroke="#1a3a2a"
          strokeWidth="0.8"
          opacity="0.6"
        />
        <Path
          d="M -6 0 L 8 3"
          stroke="#1a3a2a"
          strokeWidth="0.8"
          opacity="0.6"
        />
        <Path
          d="M -4 8 L 6 10"
          stroke="#1a3a2a"
          strokeWidth="0.8"
          opacity="0.6"
        />
      </G>

      {/* Diagonal slash across the leaf */}
      <Path
        d="M 105 80 L 130 105"
        stroke="#a3e635"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
    </Svg>
  );
}
