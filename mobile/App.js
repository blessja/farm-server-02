import React, { useEffect, useMemo, useState } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
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
import QueueScreen from "./src/screens/QueueScreen";
import CheckedInScreen from "./src/screens/CheckedInScreen";
import TabBar from "./src/components/TabBar";
import AuthScreen from "./src/screens/AuthScreen";
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
import { useOfflineQueue } from "./src/hooks/useOfflineQueue";

const tabs = [
  { key: "dashboard", label: "Home" },
  { key: "daywork", label: "DayWork" },
  { key: "working", label: "Working" },
  { key: "move", label: "Move" },
  { key: "clock", label: "Clock" },
  { key: "fast", label: "Fast" },
  { key: "queue", label: "Queue" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [jobType, setJobType] = useState("");
  const [bootState, setBootState] = useState({
    loading: true,
    authRequired: false,
    authenticated: false,
    supervisorName: "",
    rememberedSupervisorName: "",
  });
  const offlineQueue = useOfflineQueue();

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
          rememberedSupervisorName:
            supervisorSession?.supervisorName || lastSupervisorName || "",
        });
      } catch (error) {
        setBootState({
          loading: false,
          authRequired: false,
          authenticated: false,
          supervisorName: "",
          rememberedSupervisorName: "",
        });
      }
    }

    bootstrap();
  }, []);

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
    }));
  }

  const renderContent = () => {
    if (bootState.loading) {
      return (
        <View className="flex-1 px-5 justify-center">
          <Text className="text-gray-800 text-base font-bold">
            Preparing mobile workspace...
          </Text>
        </View>
      );
    }

    if (!bootState.authenticated) {
      return (
        <AuthScreen
          initialSupervisorName={bootState.rememberedSupervisorName}
          onAuthenticated={async ({ supervisorName, authEnabled }) => {
            await setLastSupervisorName(supervisorName || "Supervisor");
            await setSupervisorSession({
              supervisorName: supervisorName || "Supervisor",
              authEnabled,
            });
            setBootState((current) => ({
              ...current,
              authenticated: true,
              supervisorName: supervisorName || "Supervisor",
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
        return <CheckedInScreen offlineQueue={offlineQueue} />;
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
      case "queue":
        return <QueueScreen offlineQueue={offlineQueue} />;
      case "dashboard":
      default:
        return (
          <DashboardScreen
            sharedState={sharedState}
            offlineQueue={offlineQueue}
          />
        );
    }
  };

  return (
    <SafeAreaProvider>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <View className="flex-1 bg-white">
        <SafeAreaView className="bg-white" edges={["top"]}>
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

              {bootState.authenticated ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={{ marginTop: 6, borderRadius: 12, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 14, paddingVertical: 10 }}
                  onPress={handleLogout}
                >
                  <Text style={{ color: "#374151", fontSize: 13, fontWeight: "800" }}>
                    Logout
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </SafeAreaView>

        <View className="flex-1">{renderContent()}</View>

        {bootState.loading || !bootState.authenticated ? null : (
          <SafeAreaView className="bg-white" edges={["bottom"]}>
            <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}
