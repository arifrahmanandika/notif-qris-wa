import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AppState,
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Button,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as KeepAwake from "expo-keep-awake";
import { io } from "socket.io-client";
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import {
  ENV,
  SOCKET_IO_OPTIONS,
  BACKGROUND_TASK_NAME,
  logConfig,
  isValidUrl,
} from "./config";

const CONFIG_FILE_URI = `${FileSystem.documentDirectory}qris-wa-config.json`;

const uint8ArrayToBase64 = (u8Arr) => {
  const CHUNK_SIZE = 0x8000;
  let index = 0;
  let output = "";
  while (index < u8Arr.length) {
    const slice = u8Arr.subarray(
      index,
      Math.min(index + CHUNK_SIZE, u8Arr.length),
    );
    output += String.fromCharCode.apply(null, slice);
    index += CHUNK_SIZE;
  }

  const base64Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let result = "";
  let remainder = output.length % 3;
  for (let i = 0; i < output.length; i += 3) {
    const a = output.charCodeAt(i);
    const b = output.charCodeAt(i + 1);
    const c = output.charCodeAt(i + 2);
    const triple = (a << 16) | (b << 8) | c;
    result += base64Chars[(triple >> 18) & 0x3f];
    result += base64Chars[(triple >> 12) & 0x3f];
    result += base64Chars[(triple >> 6) & 0x3f];
    result += base64Chars[triple & 0x3f];
  }
  if (remainder === 1) {
    const a = output.charCodeAt(output.length - 1);
    const triple = a << 16;
    result =
      result.slice(0, -2) +
      base64Chars[(triple >> 18) & 0x3f] +
      base64Chars[(triple >> 12) & 0x3f] +
      "==";
  } else if (remainder === 2) {
    const a = output.charCodeAt(output.length - 2);
    const b = output.charCodeAt(output.length - 1);
    const triple = (a << 16) | (b << 8);
    result =
      result.slice(0, -1) +
      base64Chars[(triple >> 18) & 0x3f] +
      base64Chars[(triple >> 12) & 0x3f] +
      base64Chars[(triple >> 6) & 0x3f] +
      "=";
  }
  return result;
};

// Define background task for keeping connection alive
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    console.log("[BACKGROUND] Background task started");
    // Task runs periodically in background to keep socket alive
    // The socket connection in the main app handles actual communication
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.log("[BACKGROUND] Background task error:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Define TTS background task
const TTS_BACKGROUND_TASK = "TTS_BACKGROUND_TASK";
TaskManager.defineTask(TTS_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.log("[TTS-BACKGROUND] Task error:", error);
    return;
  }

  if (data) {
    const { text, audio } = data;
    console.log("[TTS-BACKGROUND] Processing TTS:", text);

    try {
      if (audio) {
        // Handle binary audio data in background
        const audioBuffer =
          audio instanceof Uint8Array
            ? audio
            : audio instanceof ArrayBuffer
              ? new Uint8Array(audio)
              : Array.isArray(audio)
                ? new Uint8Array(audio)
                : null;

        if (audioBuffer) {
          const base64 = uint8ArrayToBase64(audioBuffer);
          const audioFileUri = `${FileSystem.cacheDirectory}bg-tts-audio.mp3`;

          await FileSystem.writeAsStringAsync(audioFileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const sound = createAudioPlayer(audioFileUri);
          await sound.play();
          sound.remove();
        }
      } else {
        // Use Speech API for text-to-speech
        await Speech.speak(text, {
          language: "id-ID",
          onDone: () => console.log("[TTS-BACKGROUND] Speech completed"),
          onError: (error) =>
            console.log("[TTS-BACKGROUND] Speech error:", error),
        });
      }
    } catch (error) {
      console.log("[TTS-BACKGROUND] Error processing TTS:", error);
    }
  }
});

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [serverAddress, setServerAddress] = useState(ENV.BACKEND_URL);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionLog, setConnectionLog] = useState([]);
  const [appState, setAppState] = useState(AppState.currentState);
  const socketRef = useRef(null);
  const soundRef = useRef(null);
  const audioFileUri = `${FileSystem.cacheDirectory}qris-audio.mp3`;
  const ttsQueueRef = useRef([]);

  const addLog = useCallback((message) => {
    console.log("[QRIS-WA]", message);
    setConnectionLog((prev) => [
      ...prev.slice(-9),
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  }, []);

  const loadSavedServerAddress = async () => {
    try {
      const info = await FileSystem.getInfoAsync(CONFIG_FILE_URI);
      if (info.exists) {
        const saved = await FileSystem.readAsStringAsync(CONFIG_FILE_URI);
        const parsed = JSON.parse(saved || "{}");
        if (parsed.serverAddress && isValidUrl(parsed.serverAddress)) {
          setServerAddress(parsed.serverAddress);
          addLog(`Loaded saved server address: ${parsed.serverAddress}`);
          return parsed.serverAddress;
        }
      }
    } catch (error) {
      addLog(`Failed to load saved server address: ${error.message}`);
    }
    return null;
  };

  const saveServerAddress = async (address) => {
    try {
      if (!address || !isValidUrl(address)) {
        return;
      }
      await FileSystem.writeAsStringAsync(
        CONFIG_FILE_URI,
        JSON.stringify({ serverAddress: address }),
      );
      addLog(`Saved server address: ${address}`);
    } catch (error) {
      addLog(`Failed to save server address: ${error.message}`);
    }
  };

  const getAudioDataAsUint8Array = (audioData) => {
    if (!audioData) return null;
    if (audioData instanceof Uint8Array) return audioData;
    if (audioData instanceof ArrayBuffer) return new Uint8Array(audioData);
    if (audioData.data && Array.isArray(audioData.data))
      return new Uint8Array(audioData.data);
    if (Array.isArray(audioData)) return new Uint8Array(audioData);
    return null;
  };

  const unloadCurrentSound = async () => {
    if (soundRef.current) {
      try {
        soundRef.current.remove();
      } catch (error) {
        console.warn("Failed to unload previous sound:", error);
      }
      soundRef.current = null;
    }
  };

  const setupAudioForBackground = async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: "doNotMix",
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });
      console.log("[AUDIO] Audio mode set for background playback");
    } catch (error) {
      console.warn("[AUDIO] Failed to set audio mode:", error);
    }
  };

  const startForegroundService = async () => {
    try {
      // Request notification permissions for foreground service
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        console.log("[FOREGROUND] Notification permission not granted");
        return;
      }

      // Register TTS background task
      await BackgroundFetch.registerTaskAsync(TTS_BACKGROUND_TASK, {
        minimumInterval: 1, // Minimum interval for TTS
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log("[FOREGROUND] Foreground service started for TTS");
    } catch (error) {
      console.warn("[FOREGROUND] Failed to start foreground service:", error);
    }
  };

  const stopForegroundService = async () => {
    try {
      await BackgroundFetch.unregisterTaskAsync(TTS_BACKGROUND_TASK);
      console.log("[FOREGROUND] Foreground service stopped");
    } catch (error) {
      console.warn("[FOREGROUND] Failed to stop foreground service:", error);
    }
  };

  const playAudioFromBinary = async (audioData) => {
    const audioBuffer = getAudioDataAsUint8Array(audioData);
    if (!audioBuffer) {
      throw new Error("Invalid audio data received");
    }

    const base64 = uint8ArrayToBase64(audioBuffer);
    await FileSystem.writeAsStringAsync(audioFileUri, base64, {
      encoding: FileSystem.EncodingType?.Base64 || "base64",
    });

    await unloadCurrentSound();
    const newSound = createAudioPlayer(audioFileUri);
    newSound.play();
    soundRef.current = newSound;
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        logConfig();
        await loadSavedServerAddress();

        // Enable keep awake to prevent device sleep
        KeepAwake.activate();
        console.log("[INIT] Keep awake activated");

        // Setup audio for background playback
        await setupAudioForBackground();

        // Start foreground service for persistent TTS
        await startForegroundService();

        // Register background fetch task
        await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
          minimumInterval: 15, // Check every 15 seconds minimum
          stopOnTerminate: false, // Continue even if app is terminated
          startOnBoot: true, // Start task on device boot
        });
        console.log("[INIT] Background fetch task registered");
      } catch (error) {
        console.log("[INIT] Error initializing background:", error);
      }
    };

    initializeApp();

    return () => {
      unloadCurrentSound();
      KeepAwake.deactivate();
      stopForegroundService();
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setErrorMessage("");
    if (!serverAddress || !isValidUrl(serverAddress)) {
      const message =
        "Invalid server address. Use a valid URL like http://192.168.1.101:3000";
      setErrorMessage(message);
      addLog(message);
      return;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    await saveServerAddress(serverAddress);

    try {
      addLog(`Attempting to connect to ${serverAddress}`);
      const socket = io(serverAddress, SOCKET_IO_OPTIONS);
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        setErrorMessage("");
        addLog("✓ Connected successfully");
      });

      socket.on("connect_error", (error) => {
        addLog(`✗ Connection error: ${error.message}`);
        setErrorMessage(`Connection Error: ${error.message}`);
      });

      socket.on("disconnect", (reason) => {
        setConnected(false);
        addLog(`Disconnected: ${reason}`);
      });

      socket.on("qris-message", (data) => {
        addLog(`Received message: ${data.text}`);
        setMessages((prev) => [data, ...prev]);

        // Play TTS based on app state
        if (appState === "active") {
          // Play directly when app is active
          if (data.audio) {
            playAudioFromBinary(data.audio).catch((error) => {
              addLog(`Audio playback failed: ${error.message}`);
              Speech.speak(data.text, { language: "id-ID" });
            });
          } else {
            Speech.speak(data.text, { language: "id-ID" });
          }
        } else {
          // Use foreground service when app is in background
          addLog(`Playing TTS in background: ${data.text}`);
          // For now, we'll use direct TTS in background
          // In production, you'd want to use a more robust background service
          if (data.audio) {
            playAudioFromBinary(data.audio).catch((error) => {
              Speech.speak(data.text, { language: "id-ID" });
            });
          } else {
            Speech.speak(data.text, { language: "id-ID" });
          }
        }
      });

      socket.on("error", (error) => {
        addLog(`Socket error: ${error}`);
        setErrorMessage(`Socket Error: ${error}`);
      });
    } catch (error) {
      addLog(`Exception: ${error.message}`);
      setErrorMessage(`Exception: ${error.message}`);
      Alert.alert("Error", `Failed to connect: ${error.message}`);
    }
  }, [serverAddress, addLog]);

  useEffect(() => {
    handleConnect();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [handleConnect]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
      addLog(`App state changed to ${nextState}`);
      if (nextState === "active" && !connected) {
        addLog("App returned to foreground, reconnecting socket if needed.");
        handleConnect();
      } else if (nextState === "background") {
        addLog(
          "App moved to background. Socket and TTS will continue via foreground service.",
        );
      } else if (nextState === "inactive") {
        addLog("App became inactive - preparing for background mode.");
      }
    });

    return () => {
      subscription.remove();
    };
  }, [connected, handleConnect, addLog]);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>QRIS WA Bot</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter server address (e.g., http://192.168.1.101:3000)"
        value={serverAddress}
        onChangeText={setServerAddress}
      />
      <Button title="Connect" onPress={handleConnect} />

      <Text style={styles.status}>
        Status: {connected ? "🟢 Connected" : "🔴 Disconnected"}
      </Text>

      {errorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>Recent QRIS Messages</Text>
      <FlatList
        data={messages}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={styles.message}>
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
        )}
      />

      <Text style={styles.subtitle}>Connection Log:</Text>
      <View style={styles.logContainer}>
        {connectionLog.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  input: {
    height: 40,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  status: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  infoText: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 10,
    color: "#4caf50",
    backgroundColor: "#e8f5e8",
    padding: 8,
    borderRadius: 5,
    textAlign: "center",
  },
  errorContainer: {
    backgroundColor: "#ffebee",
    borderColor: "#c62828",
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    color: "#c62828",
    fontSize: 14,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 5,
    color: "#666",
  },
  logContainer: {
    backgroundColor: "#fff",
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
  },
  logText: {
    fontSize: 12,
    color: "#555",
    marginBottom: 2,
    fontFamily: "monospace",
  },
  message: {
    backgroundColor: "#fff",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    marginBottom: 5,
  },
  timestamp: {
    fontSize: 12,
    color: "#666",
  },
});
