// Environment configuration
// Update based on your deployment environment

export const ENV = {
  // Change this to match your backend server
  BACKEND_URL:
    process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.1.101:3000", // Default: development server
};

export const SOCKET_IO_OPTIONS = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
  transports: ["polling", "websocket"],
  reconnectionEmit: {
    error: true,
  },
  // Keep connection alive with longer timeout
  pingInterval: 25000,
  pingTimeout: 60000,
  // Fallback to polling if websocket fails
  upgrade: true,
};

// Helper function to validate URL
export const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Helper to get environment-specific URL
export const getBackendUrl = (customUrl = null) => {
  if (customUrl && isValidUrl(customUrl)) {
    return customUrl;
  }
  return ENV.BACKEND_URL;
};

// Log configuration (useful for debugging)
export const logConfig = () => {
  console.log("[CONFIG] Backend URL:", ENV.BACKEND_URL);
  console.log("[CONFIG] Socket IO Options:", SOCKET_IO_OPTIONS);
};

// Background task name
export const BACKGROUND_TASK_NAME = "qris-background-task";
