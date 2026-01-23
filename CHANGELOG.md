# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-23

### Added
- 🎉 Initial release of Android Studio Lite
- **Build System**
  - Build Debug APK
  - Build Release APK
  - Clean Project
  - Sync Gradle
  - One-click Build & Run
- **Device Management**
  - USB device detection and management
  - Device selection from sidebar
  - Auto-refresh device list
- **Wireless Debugging**
  - Wireless Debugging support (Android 11+)
  - ADB over TCP/IP support (Android 4.0+)
  - Automatic reconnection to saved devices
  - Network scanning for devices
- **Logcat**
  - Real-time Logcat output with colors
  - Filter by app (like Android Studio)
  - Filter by TAG
  - Show all logs mode
  - Critical word highlighting
- **UI**
  - Android Control Panel in sidebar
  - Status bar with device info and quick run
  - Build progress notifications
- **Diagnostics**
  - Built-in diagnostic tool for troubleshooting

### Technical
- Written in TypeScript with strict type checking
- Modular architecture for maintainability
- Automatic SDK and ADB detection
- Cross-platform support (Windows, macOS, Linux)
