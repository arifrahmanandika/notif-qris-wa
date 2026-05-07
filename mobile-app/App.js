import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Button,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { io } from "socket.io-client";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { ENV, SOCKET_IO_OPTIONS, logConfig } from "./config";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [serverAddress, setServerAddress] = useState(ENV.BACKEND_URL);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionLog, setConnectionLog] = useState([]);
  const socketRef = useRef(null);
  const soundRef = useRef(null);
  const audioFileUri = `${FileSystem.cacheDirectory}qris-audio.mp3`;

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
        await soundRef.current.unloadAsync();
      } catch (error) {
        console.warn("Failed to unload previous sound:", error);
      }
      soundRef.current = null;
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
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: audioFileUri },
      { shouldPlay: true },
    );
    soundRef.current = newSound;
  };

  useEffect(() => {
    logConfig();
    return () => {
      unloadCurrentSound();
    };
  }, []);

  const addLog = (message) => {
    console.log("[QRIS-WA]", message);
    setConnectionLog((prev) => [
      ...prev.slice(-9),
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const handleConnect = () => {
    setErrorMessage("");
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
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

        if (data.audio) {
          playAudioFromBinary(data.audio).catch((error) => {
            addLog(`Audio playback failed: ${error.message}`);
            Speech.speak(data.text, { language: "id-ID" });
          });
        } else {
          Speech.speak(data.text, { language: "id-ID" });
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
  };

  useEffect(() => {
    handleConnect();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

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

      <Text style={styles.subtitle}>Connection Log:</Text>
      <View style={styles.logContainer}>
        {connectionLog.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
      </View>

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
    maxHeight: 120,
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
