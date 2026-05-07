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
import { ENV, SOCKET_IO_OPTIONS, logConfig } from "./config";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [serverAddress, setServerAddress] = useState(ENV.BACKEND_URL);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectionLog, setConnectionLog] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    // Log configuration on app start
    logConfig();
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
        Speech.speak(data.text, { language: "id-ID" });
        setMessages((prev) => [data, ...prev]);
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
