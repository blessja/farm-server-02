import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { DEVICE_NAME } from "../config/env";

export default function AuthScreen({ onAuthenticated }) {
  const [supervisorName, setSupervisorName] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setFeedback({ type: "info", message: "" });

    try {
      const result = await api.login({
        supervisorName,
        pin,
        deviceName: DEVICE_NAME,
      });

      if (result.authEnabled === false) {
        setFeedback({
          type: "success",
          message: "Server auth is disabled. Continuing without a token.",
        });
        onAuthenticated({
          supervisorName: supervisorName.trim() || "Supervisor",
          authEnabled: false,
        });
      } else {
        setFeedback({
          type: "success",
          message: `Login successful. Welcome, ${result.supervisorName}.`,
        });
        onAuthenticated({
          supervisorName: result.supervisorName,
          authEnabled: true,
        });
      }
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenScroll>
      <SectionCard
        title="Mobile access"
        subtitle="Supervisors sign in with their name and PIN. The signed-in supervisor is shown in the app header for accountability."
      >
        <Text style={styles.helper}>Device name: {DEVICE_NAME}</Text>
        <LabeledInput
          label="Supervisor name"
          value={supervisorName}
          onChangeText={setSupervisorName}
          placeholder="Enter supervisor name"
          autoCapitalize="words"
        />
        <LabeledInput
          label="Supervisor PIN"
          value={pin}
          onChangeText={setPin}
          placeholder="Enter mobile PIN"
          keyboardType="numeric"
          secureTextEntry
        />
        <ActionButton
          label={submitting ? "Signing in..." : "Sign in"}
          onPress={handleLogin}
          disabled={submitting}
        />
        <FeedbackBanner
          type={feedback.type === "error" ? "error" : "success"}
          message={feedback.message}
        />
      </SectionCard>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  helper: {
    color: "#314238",
    fontSize: 14,
    lineHeight: 20,
  },
});
