# Panduan Build APK QRIS WA App

## Masalah Umum: Koneksi Gagal di APK Tapi Berhasil di Expo Go

### Penyebab Utama

1. **Cleartext Traffic Blocked** - Android 9+ memblokir HTTP traffic di production APK
2. **IP Address Lokal** - IP 192.168.1.101 tidak accessible di device berbeda
3. **Network Configuration** - Perbedaan antara debug dan release build

### Solusi yang Sudah Diterapkan

✅ Menambahkan `usesCleartextTraffic: true` di app.json untuk mendukung HTTP
✅ Menambahkan permissions network yang diperlukan
✅ Menambahkan detailed error logging untuk debugging
✅ Menambahkan reconnection logic dengan exponential backoff

## Cara Build APK Dengan Benar

### Metode 1: Menggunakan EAS Build (Recommended)

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login ke EAS
eas login

# 3. Build APK
eas build --platform android --type apk
```

### Metode 2: Build Lokal dengan Expo Go + Prebuild

```bash
# 1. Install dependencies
npm install

# 2. Prebuild native files
expo prebuild --clean

# 3. Build dengan Android Studio atau gradle
cd android
./gradlew assembleRelease
```

### Metode 3: Menggunakan expo build (legacy, tapi masih bisa)

```bash
expo build:android -t apk
```

## Konfigurasi Server Address

### Development (Expo Go)

- ✅ `http://192.168.1.101:3000` - Bekerja di device yang sama network
- ✅ `http://localhost:3000` - Hanya bekerja di emulator Android

### Production (APK Build)

- ❌ `http://192.168.1.101:3000` - Mungkin tidak accessible
- ✅ `http://<ACTUAL_IP>:3000` - Gunakan IP address device yang menjalankan BE
- ✅ `https://yourdomain.com:3000` - Gunakan domain HTTPS (lebih aman)

### Cara Cek IP Address Server

```bash
# Di Windows (tempat BE berjalan)
ipconfig

# Di Linux/Mac
ifconfig
# atau
hostname -I
```

## Debugging Connection Issues

### 1. Lihat Connection Log di App

- Aplikasi akan menampilkan timestamp dan detail setiap koneksi attempt
- Error message akan ditampilkan di UI untuk diagnosis

### 2. Check Backend Logs

```bash
# Di backend folder
node server.js

# Perhatikan console output untuk error CORS atau connection
```

### 3. Test dari Adb

```bash
# Connect ke emulator/device via adb
adb shell

# Test koneksi ke server
curl -v http://192.168.1.101:3000
```

### 4. Network Configuration Debug

- Pastikan Android device dan BE server di network yang sama
- Check firewall di Windows: `netstat -ano | findstr :3000`
- Pastikan port 3000 listening: `netstat -an | findstr LISTENING`

## Backend Verifikasi

### Pastikan CORS di-enable

```javascript
// Sudah ada di server.js
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
```

### Verifikasi Server Listening

```bash
# Test koneksi lokal
curl http://localhost:3000

# Test dari device dengan IP server
curl http://<SERVER_IP>:3000
```

## Checklist Sebelum Build APK Final

- [ ] App.json sudah di-update dengan `usesCleartextTraffic: true`
- [ ] Package.json sudah di-install dengan `npm install`
- [ ] Server IP address benar dan accessible dari device
- [ ] Backend server running dan CORS enabled
- [ ] Tested dengan Expo Go terlebih dahulu
- [ ] Checked connection logs di UI untuk error details
- [ ] Backend firewall allow port 3000

## Jika Masih Gagal Setelah Build

### Langkah 1: Capture Full Error

- Gunakan `adb logcat` untuk melihat full error logs
- Perhatikan connection log di UI app

### Langkah 2: Try HTTPS

- Gunakan HTTPS dengan valid certificate
- Update `usesCleartextTraffic` ke `false` di app.json
- Ubah server address ke `https://...`

### Langkah 3: Debug dengan Android Studio

- Build dan run melalui Android Studio
- Gunakan Android Profiler untuk monitor network traffic
- Set breakpoints di socket.io connection code

## File yang Sudah Di-Update

1. **app.json** - Added:
   - `usesCleartextTraffic: true`
   - Network permissions
   - Build properties plugin

2. **App.js** - Added:
   - Better error handling
   - Connection logging
   - Reconnection strategy
   - Error display di UI

## Resources

- [Expo Cleartext Traffic](https://docs.expo.dev/guides/configuring-cleartext-traffic/)
- [Android Network Security](https://developer.android.com/training/articles/security-config)
- [Socket.io React Native](https://socket.io/docs/v4/react-native-client/)
