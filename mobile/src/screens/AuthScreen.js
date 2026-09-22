import React, { useState } from "react";
import { Text } from "react-native";
import { api } from "../api/client";
import ScreenScroll from "../components/ScreenScroll";
import SectionCard from "../components/SectionCard";
import LabeledInput from "../components/LabeledInput";
import ActionButton from "../components/ActionButton";
import FeedbackBanner from "../components/FeedbackBanner";
import { DEVICE_NAME } from "../config/env";
import { useLanguage } from "../i18n";

export default function AuthScreen({ onAuthenticated, initialSupervisorName = "" }) {
  const { t } = useLanguage();
  const [supervisorName, setSupervisorName] = useState(initialSupervisorName);
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState({ type: "info", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    const trimmedSupervisorName = supervisorName.trim();
    const trimmedPin = pin.trim();

    if (!trimmedSupervisorName) {
      setFeedback({ type: "error", message: t("auth.nameRequired") });
      return;
    }

    if (!trimmedPin) {
      setFeedback({ type: "error", message: t("auth.pinRequired") });
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
          message: t("auth.authDisabled"),
        });
        onAuthenticated({
          supervisorName: trimmedSupervisorName,
          authEnabled: false,
        });
      } else {
        setFeedback({
          type: "success",
          message: t("auth.loginSuccess", { name: result.supervisorName }),
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
        title={t("auth.title")}
        subtitle={t("auth.subtitle")}
      >
        <Text className="text-gray-600 text-sm leading-5">{t("auth.device", { name: DEVICE_NAME })}</Text>
        <LabeledInput
          label={t("auth.supervisorName")}
          value={supervisorName}
          onChangeText={setSupervisorName}
          placeholder={t("auth.supervisorNamePlaceholder")}
          autoCapitalize="words"
        />
        <LabeledInput
          label={t("auth.supervisorPIN")}
          value={pin}
          onChangeText={setPin}
          placeholder={t("auth.supervisorPINPlaceholder")}
          keyboardType="numeric"
          secureTextEntry
        />
        <ActionButton
          label={submitting ? t("auth.signingIn") : t("auth.signIn")}
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
