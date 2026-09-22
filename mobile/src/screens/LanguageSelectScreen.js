import React, { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SelectField from "../components/SelectField";
import ActionButton from "../components/ActionButton";
import GlenOakLogo from "../components/GlenOakLogo";
import { LANGUAGES, useLanguage } from "../i18n";

export default function LanguageSelectScreen() {
  const { language, setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState(language);
  const [confirmed, setConfirmed] = useState(false);

  const options = Object.values(LANGUAGES).map((lang) => ({
    label: lang.label,
    value: lang.key,
  }));

  async function continueToApp() {
    await setLanguage(selected);
    setConfirmed(true);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F4F7F3" }}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 24 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <GlenOakLogo width={96} height={96} />
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#111827", textAlign: "center" }}>
            {t("lang.title")}
          </Text>
          <Text style={{ fontSize: 14, color: "#6b7280", textAlign: "center" }}>
            {t("lang.subtitle")}
          </Text>
        </View>

        <View className="rounded-3xl bg-white p-4 border border-gray-100 shadow-sm" style={{ gap: 4 }}>
          <Text style={{ color: "#4b5563", fontSize: 12, fontWeight: "700" }}>
            {t("lang.select")}
          </Text>
          <SelectField
            value={selected}
            placeholder={t("lang.title")}
            options={options}
            onSelect={setSelected}
          />
          <ActionButton label={t("lang.continue")} onPress={continueToApp} />
        </View>
      </View>
    </SafeAreaView>
  );
}