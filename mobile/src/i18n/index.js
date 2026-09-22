import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "./en";
import af from "./af";

export const LANGUAGES = {
  en: { label: "English", key: "en" },
  af: { label: "Afrikaans", key: "af" },
};

const resources = { en, af };
const STORAGE_KEY = "farm-mobile-language";

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match
  );
}

function createT(language) {
  const dict = resources[language] || resources.en;
  const fallback = resources.en;
  return (key, params) => {
    const template = dict[key] ?? fallback[key] ?? key;
    return interpolate(template, params);
  };
}

const LanguageContext = createContext({
  language: "en",
  hydrated: false,
  chosen: false,
  setLanguage: async () => {},
  t: createT("en"),
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState("en");
  const [hydrated, setHydrated] = useState(false);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "en" || saved === "af") {
          setLanguageState(saved);
          setChosen(true);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setLanguage = useCallback(async (next) => {
    if (next !== "en" && next !== "af") return;
    setLanguageState(next);
    setChosen(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // ignore persistence failures; language still applies for the session
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      hydrated,
      chosen,
      setLanguage,
      t: createT(language),
    }),
    [language, hydrated, chosen, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}