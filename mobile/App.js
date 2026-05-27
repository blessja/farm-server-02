import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import DashboardScreen from "./src/screens/DashboardScreen";
import BlocksScreen from "./src/screens/BlocksScreen";
import RowWorkflowScreen from "./src/screens/RowWorkflowScreen";
import ClockScreen from "./src/screens/ClockScreen";
import FastPieceworkScreen from "./src/screens/FastPieceworkScreen";
import QueueScreen from "./src/screens/QueueScreen";
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
  { key: "dashboard", label: "Overview" },
  { key: "blocks", label: "Blocks" },
  { key: "workflow", label: "Rows" },
  { key: "clock", label: "Clock" },
  { key: "fast", label: "Fast PW" },
  { key: "queue", label: "Queue" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
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
    }),
    [selectedBlock, selectedRow]
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
    setBootState((current) => ({
      ...current,
      authenticated: false,
      supervisorName: "",
    }));
  }

  const renderContent = () => {
    if (bootState.loading) {
      return (
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Preparing mobile workspace...</Text>
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
      case "blocks":
        return <BlocksScreen sharedState={sharedState} />;
      case "workflow":
        return (
          <RowWorkflowScreen
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
      <View style={styles.screen}>
        <SafeAreaView style={styles.safeTop} edges={["top"]}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.kicker}>Farm Operations</Text>
                <Text style={styles.title}>Glen Oak Farm @2026</Text>
                {bootState.authenticated && bootState.supervisorName ? (
                  <Text style={styles.subtitle}>
                    Signed in as {bootState.supervisorName}
                  </Text>
                ) : null}
              </View>

              {bootState.authenticated ? (
                <Pressable style={styles.logoutButton} onPress={handleLogout}>
                  <Text style={styles.logoutLabel}>Logout</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </SafeAreaView>

        <View style={styles.content}>{renderContent()}</View>

        {bootState.loading || !bootState.authenticated ? null : (
          <SafeAreaView style={styles.safeBottom} edges={["bottom"]}>
            <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4efe3",
  },
  safeTop: {
    backgroundColor: "#f4efe3",
  },
  safeBottom: {
    backgroundColor: "#f4efe3",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  kicker: {
    color: "#786247",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    color: "#1d3828",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 8,
    color: "#4f5d54",
    fontSize: 14,
    lineHeight: 20,
  },
  logoutButton: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: "#e6dac3",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutLabel: {
    color: "#284132",
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  loadingText: {
    color: "#2e4336",
    fontSize: 16,
    fontWeight: "700",
  },
});
