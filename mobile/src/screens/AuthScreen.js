import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { DEVICE_NAME } from "../config/env";

export default function AuthScreen({ onAuthenticated, initialSupervisorName = "" }) {
  const [supervisorName, setSupervisorName] = useState(initialSupervisorName);
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    const trimmedSupervisorName = supervisorName.trim();
    const trimmedPin = pin.trim();

    if (!trimmedSupervisorName) {
      setFeedback({ type: "error", message: "Supervisor name is required." });
      return;
    }

    if (!trimmedPin) {
      setFeedback({ type: "error", message: "Supervisor PIN is required." });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: "info", message: "" });

    try {
      const result = await api.login({
        supervisorName: trimmedSupervisorName,
        pin: trimmedPin,
        deviceName: DEVICE_NAME,
      });

      if (result.authEnabled === false) {
        setFeedback({
          type: "success",
          message: "Server auth is disabled. Continuing without a token.",
        });
        onAuthenticated({
          supervisorName: trimmedSupervisorName,
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
        title="Supervisor login"
        subtitle="Supervisors must sign in before using the app. When backend auth is enabled, the name and PIN are verified by the server and the signed-in supervisor is shown in the header."
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
