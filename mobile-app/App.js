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

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [serverAddress, setServerAddress] = useState(
    "http://192.168.1.101:3000",
  );
  const socketRef = useRef(null);

  const handleConnect = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    try {
      const socket = io(serverAddress);
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
      });

      socket.on("disconnect", () => {
        setConnected(false);
      });

      socket.on("qris-message", (data) => {
        Speech.speak(data.text, { language: "id-ID" });
        setMessages((prev) => [data, ...prev]);
      });
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to connect to server. Please check the address.",
      );
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
        Connection Status: {connected ? "Connected" : "Disconnected"}
      </Text>
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
