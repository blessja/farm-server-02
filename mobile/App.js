import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import "./global.css";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import DashboardScreen from "./src/screens/DashboardScreen";
import DayWorkScreen from "./src/screens/DayWorkScreen";
import MoveWorkersScreen from "./src/screens/MoveWorkersScreen";
import ClockScreen from "./src/screens/ClockScreen";
import FastPieceworkScreen from "./src/screens/FastPieceworkScreen";
import TotalsScreen from "./src/screens/TotalsScreen";
import QueueScreen from "./src/screens/QueueScreen";
import CheckedInScreen from "./src/screens/CheckedInScreen";
import TabBar from "./src/components/TabBar";
import AuthScreen from "./src/screens/AuthScreen";
import SplashScreen from "./src/components/SplashScreen";
import { api } from "./src/api/client";
import {
  clearAuthToken,
  clearSupervisorSession,
  getAuthToken,
  getLastSupervisorName,
  getSupervisorSession,
  setLastSupervisorName,
  setSupervisorSession,
} from "./src/storage/authStorage";
import { clearAllCache } from "./src/storage/cacheStorage";
import { useOfflineQueue } from "./src/hooks/useOfflineQueue";
import { useLanguage } from "./src/i18n";

const tabs = [
  { key: "dashboard", label: "Home" },
  { key: "daywork", label: "DayWork" },
  { key: "working", label: "Working" },
  { key: "move", label: "Move" },
  { key: "clock", label: "Clock" },
  { key: "fast", label: "Fast" },
  { key: "totals", label: "Totals" },
  { key: "queue", label: "Queue" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [jobType, setJobType] = useState("");
  const [activeWorkersOpen, setActiveWorkersOpen] = useState(false);
  const [bootState, setBootState] = useState({
    loading: true,
    authRequired: false,
    authenticated: false,
    supervisorName: "",
    isAdmin: false,
    rememberedSupervisorName: "",
  });
  const offlineQueue = useOfflineQueue();
  const { t } = useLanguage();

  const sharedState = useMemo(
    () => ({
      selectedBlock,
      setSelectedBlock,
      selectedRow,
      setSelectedRow,
      jobType,
      setJobType,
    }),
    [selectedBlock, selectedRow, jobType]
  );

  useEffect(() => {
    async function bootstrap() {
      try {
        const [authStatus, token, supervisorSession, lastSupervisorName] = await Promise.all([
          api.getAuthStatus(),
          getAuthToken(),
          getSupervisorSession(),
          getLastSupervisorName(),
        ]);

        let authenticated = false;

        if (authStatus.authEnabled && token) {
          try {
            const verification = await api.verifyAuth();
            authenticated = true;
            setBootState({
              loading: false,
              authRequired: authStatus.authEnabled,
              authenticated,
              supervisorName:
                verification?.payload?.supervisorName || "Supervisor",
              isAdmin: verification?.payload?.isAdmin === true,
              rememberedSupervisorName:
                verification?.payload?.supervisorName ||
                lastSupervisorName ||
                "",
            });
            return;
          } catch (error) {
            await clearAuthToken();
            await clearSupervisorSession();
            authenticated = false;
          }
        }

        if (!authStatus.authEnabled && supervisorSession?.supervisorName) {
          authenticated = true;
        }

        setBootState({
          loading: false,
          authRequired: authStatus.authEnabled,
          authenticated,
          supervisorName: authenticated
            ? supervisorSession?.supervisorName || "Supervisor"
            : "",
          isAdmin: authenticated && supervisorSession?.isAdmin === true,
          rememberedSupervisorName:
            supervisorSession?.supervisorName || lastSupervisorName || "",
        });
      } catch (error) {
        setBootState({
          loading: false,
          authRequired: false,
          authenticated: false,
          supervisorName: "",
          isAdmin: false,
          rememberedSupervisorName: "",
        });
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    setIsInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );

    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error) => {
        console.error("Could not register the Glen Oak offline app shell.", error);
      });
  }, []);

  async function handleInstall() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    Alert.alert(
      t("pwa.installHelpTitle"),
      t("pwa.installHelpMessage")
    );
  }

  async function handleClearCache() {
    await clearAllCache();
    setCacheEpoch((epoch) => epoch + 1);
  }

  // A refresh must bypass the per-screen cache, otherwise useAsyncData serves
  // the stored copy while it is still inside its staleTime window and the user
  // sees no change. Clearing the cache and remounting the active screen forces
  // a real fetch. Queued offline writes are left alone so nothing is lost.
  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await clearAllCache();
      setRefreshEpoch((epoch) => epoch + 1);
      setCacheEpoch((epoch) => epoch + 1);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    await clearSupervisorSession();
    setActiveTab("dashboard");
    setSelectedBlock("");
    setSelectedRow("");
    setJobType("");
    setBootState((current) => ({
      ...current,
      authenticated: false,
      supervisorName: "",
      isAdmin: false,
    }));
  }

  const renderContent = () => {
    if (bootState.loading) {
      return <SplashScreen />;
    }

    if (!bootState.authenticated) {
      return (
        <AuthScreen
          initialSupervisorName={bootState.rememberedSupervisorName}
          onAuthenticated={async ({ supervisorName, authEnabled, isAdmin }) => {
            await setLastSupervisorName(supervisorName || "Supervisor");
            await setSupervisorSession({
              supervisorName: supervisorName || "Supervisor",
              authEnabled,
              isAdmin: isAdmin === true,
            });
            setBootState((current) => ({
              ...current,
              authenticated: true,
              supervisorName: supervisorName || "Supervisor",
              isAdmin: isAdmin === true,
              rememberedSupervisorName: supervisorName || "Supervisor",
            }));
          }}
        />
      );
    }

    switch (activeTab) {
      case "daywork":
        return (
          <DayWorkScreen
            sharedState={sharedState}
            offlineQueue={offlineQueue}
          />
        );
      case "working":
        return (
          <CheckedInScreen
            offlineQueue={offlineQueue}
            isAdmin={bootState.isAdmin}
            showBackdate={false}
          />
        );
      case "move":
        return (
          <MoveWorkersScreen
            sharedState={sharedState}
            offlineQueue={offlineQueue}
          />
        );
      case "clock":
        return <ClockScreen offlineQueue={offlineQueue} />;
      case "fast":
        return (
          <FastPieceworkScreen
            sharedState={sharedState}
            offlineQueue={offlineQueue}
          />
        );
      case "totals":
        return <TotalsScreen />;
      case "queue":
        return <QueueScreen offlineQueue={offlineQueue} />;
      case "dashboard":
      default:
        return (
          <DashboardScreen
            sharedState={sharedState}
            offlineQueue={offlineQueue}
            onOpenActiveWorkers={() => setActiveWorkersOpen(true)}
          />
        );
    }
  };

  if (bootState.loading) {
    return (
      <SafeAreaProvider>
        <ExpoStatusBar style="light" />
        <StatusBar barStyle="light-content" backgroundColor="#047857" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <View className="flex-1 bg-gray-50">
        <SafeAreaView className="bg-gray-50" edges={["top"]}>
          <View className="px-5 pt-3.5 pb-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-farm-600 text-xs font-bold tracking-widest uppercase">
                  Farm Operations
                </Text>
                <Text className="mt-1 text-gray-900 text-2xl font-extrabold">
                  Glen Oak Farm
                </Text>
                {bootState.authenticated && bootState.supervisorName ? (
                  <Text className="mt-1 text-gray-400 text-sm leading-5">
                    Signed in as {bootState.supervisorName}
                  </Text>
                ) : null}
              </View>

              {bootState.authenticated ||
              (Platform.OS === "web" && !isInstalled) ? (
                <View style={{ gap: 8, alignItems: "flex-end", marginTop: 6 }}>
                  {Platform.OS === "web" && !isInstalled ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      activeOpacity={0.7}
                      style={{
                        borderRadius: 12,
                        backgroundColor: "#eaf3ec",
                        borderWidth: 1,
                        borderColor: "#c7dbce",
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                      }}
                      onPress={handleInstall}
                    >
                      <Text style={{ color: "#1a5f4a", fontSize: 12, fontWeight: "700" }}>
                        {t("pwa.install")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {bootState.authenticated ? (
                    <>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={{ borderRadius: 12, backgroundColor: "#F4F7F3", borderWidth: 1, borderColor: "#D4DFD3", paddingHorizontal: 14, paddingVertical: 8 }}
                        onPress={handleClearCache}
                      >
                        <Text style={{ color: "#627060", fontSize: 12, fontWeight: "700" }}>
                          {t("header.clearCache")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={refreshing}
                        style={{
                          borderRadius: 12,
                          backgroundColor: "#EAF3FB",
                          borderWidth: 1,
                          borderColor: "#C7DBEE",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          opacity: refreshing ? 0.6 : 1,
                        }}
                        onPress={handleRefresh}
                      >
                        <Text style={{ color: "#2A5C87", fontSize: 12, fontWeight: "700" }}>
                          {refreshing ? t("header.refreshing") : t("header.refresh")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={{ borderRadius: 12, backgroundColor: "#E5ECE4", borderWidth: 1, borderColor: "#D4DFD3", paddingHorizontal: 14, paddingVertical: 10 }}
                        onPress={handleLogout}
                      >
                        <Text style={{ color: "#374236", fontSize: 13, fontWeight: "800" }}>
                          {t("header.logout")}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </SafeAreaView>

        <View className="flex-1" key={`${cacheEpoch}-${refreshEpoch}`}>
          {renderContent()}
        </View>

        <Modal visible={activeWorkersOpen} animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: "#f9fafb" }} edges={["top", "bottom"]}>
            <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
              <View>
                <Text className="text-gray-900 text-lg font-extrabold">Active workers</Text>
                <Text className="text-gray-400 text-xs mt-1">Checkout, continue, or backdate work</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                style={{ borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
                onPress={() => setActiveWorkersOpen(false)}
              >
                <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>Close</Text>
              </TouchableOpacity>
            </View>
            <CheckedInScreen
              offlineQueue={offlineQueue}
              isAdmin={bootState.isAdmin}
              showBackdate
            />
          </SafeAreaView>
        </Modal>

        {bootState.loading || !bootState.authenticated ? null : (
          <SafeAreaView className="bg-gray-50" edges={["bottom"]}>
            <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}
