# Troubleshooting: APK Tidak Bisa Koneksi ke Backend

## Diagnosis Cepat (Follow Steps Berikut)

### Step 1: Verify Backend is Running

```bash
# Di folder backend, jalankan server
cd backend
npm install
node server.js

# Catat IP address yang ditampilkan atau gunakan ipconfig
# Output seharusnya: "Server running on port 3000"
```

### Step 2: Cek IP Address Backend

```bash
# Di Windows Command Prompt
ipconfig

# Cari "IPv4 Address" di bawah "Ethernet adapter" atau "Wireless LAN adapter"
# Biasanya format: 192.168.x.x atau 10.x.x.x
```

### Step 3: Update config.js Dengan IP yang Benar

```javascript
// mobile-app/config.js
export const ENV = {
  BACKEND_URL: "http://192.168.1.101:3000", // Ganti dengan IP Anda
};
```

### Step 4: Test Dengan Expo Go Dulu

```bash
cd mobile-app
npm install
expo start

# Buka di device dengan Expo Go app
# Jika berhasil koneksi, lanjut ke Step 5
# Jika gagal, cek backend server dan IP address
```

### Step 5: Install Dependencies yang Diperlukan

```bash
# Pastikan semua dependencies sudah installed
cd mobile-app
npm install

# Atau jika menggunakan EAS Build
npm install -g eas-cli
eas login
```

### Step 6: Build APK

```bash
# Option A: Menggunakan EAS Build (recommended)
eas build --platform android --type apk

# Option B: Build lokal (lebih cepat, tapi butuh Android SDK)
expo prebuild --clean
cd android
./gradlew assembleRelease
cd ..
```

### Step 7: Install APK di Device

```bash
# Using ADB
adb install output.apk

# Atau copy APK ke device manual
```

### Step 8: Debug Connection Issues

```bash
# Lihat real-time logs dari app
adb logcat | grep QRIS-WA

# Atau lihat semua logs
adb logcat
```

## Common Issues & Solutions

### Issue: "Connection Error: Error during WebSocket handshake"

**Cause:** Network tidak bisa connect ke server
**Solutions:**

1. Pastikan IP address benar di config.js
2. Pastikan server running di backend folder
3. Pastikan device dan server di network yang sama
4. Check firewall Windows: `netstat -ano | findstr :3000`

**Command untuk verifikasi:**

```bash
# Di cmd (dari device):
adb shell
ping 192.168.1.101  # Ganti dengan IP server Anda

# Jika ping tidak bisa, berarti network issue
# Cek apakah device dan server di network yang sama
```

### Issue: "Connection timed out"

**Cause:** Server mungkin tidak accessible pada port 3000
**Solutions:**

1. Cek apakah server really running: `netstat -ano | findstr :3000`
2. Cek firewall Windows:
   - Windows Defender Firewall
   - 3rd party antivirus
3. Cek apakah port 3000 correctly exposed

**Command untuk debug:**

```bash
# Pastikan port 3000 listening
netstat -ano | findstr LISTENING | findstr :3000

# Restart backend server
cd backend
node server.js
```

### Issue: "ERR_CLEARTEXT_NOT_PERMITTED"

**Cause:** APK build memblokir HTTP traffic (cleartext)
**Solution:** Sudah fixed di app.json dengan plugin `expo-build-properties`

- Pastikan app.json sudah di-update dengan plugin config
- Rebuild APK setelah update

### Issue: "Connection refused" atau "net::ERR_EMPTY_RESPONSE"

**Cause:** Backend tidak menerima request dari APK
**Solutions:**

1. Cek CORS di backend server.js:
   ```javascript
   const io = new Server(server, {
     cors: {
       origin: "*",
       methods: ["GET", "POST"],
     },
   });
   ```
2. Cek apakah socket.io properly initialized
3. Verify backend listening di 0.0.0.0:3000 (tidak hanya localhost)

## Advanced Debugging

### See Full Application Logs

```bash
adb logcat -s "*:V" | grep -E "(QRIS-WA|socket|io|error)"
```

### Test Backend Connection Manually

```bash
# Di emulator/device
adb shell
curl -v http://192.168.1.101:3000

# Seharusnya return response dari server
```

### Monitor Network Traffic

```bash
# Gunakan tcpdump untuk capture network traffic
adb shell
tcpdump -i any -n | grep 3000
```

### Check Android Network Settings

```bash
# Show all network interfaces
adb shell
ip addr show

# Verify connectivity
netstat -atn | grep 3000
```

## File Structure Reference

```
mobile-app/
├── App.js              (Main component with socket.io connection)
├── config.js           (Configuration & environment settings)
├── app.json            (Expo config with build properties)
├── BUILD_GUIDE.md      (Build instructions)
├── TROUBLESHOOTING.md  (This file)
└── package.json
```

## Quick Checklist

- [ ] Backend server running di `node server.js`
- [ ] IP address dalam config.js sesuai dengan server
- [ ] Device dan server di network yang sama (wifi)
- [ ] Tested dengan Expo Go berhasil
- [ ] app.json sudah di-update dengan build properties
- [ ] npm dependencies sudah di-install
- [ ] APK sudah di-build setelah update config
- [ ] APK sudah di-install di device
- [ ] Connection logs menunjukkan actual error message

## Jika Masih Tidak Berhasil

1. Share error message dari connection logs (di UI app)
2. Share output dari `adb logcat`
3. Confirm IP address backend
4. Confirm network connectivity antara device dan server
5. Cek firewall settings di Windows
