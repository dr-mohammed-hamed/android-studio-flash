# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-09-22

### Fixed & Improved
- **App Launch & Package Detection**
  - Dynamic discovery of launcher activity via package manager, properly supporting debug variants (e.g., custom application IDs with different package structures).
  - Extract actual package name directly from APK with multi-tier fallback to project `build.gradle` and manifest files.
  - Intercept silent failures and error messages from `am start` command to prevent false success notifications.
  - Add compatibility fallbacks for legacy Android versions and missing build tools.
  - Incorporated PR #2 contribution by @theGBguy.

## [0.4.0] - 2026-09-13

### Added & Improved
- **Wireless Debugging Overhaul**
  - Ultra-fast raw TCP socket scanning for wireless devices.
  - Auto-save and one-click reconnect for wireless devices.
  - Device info extraction and context menu actions.
  - Network scanner disconnect bug fixes and port retry handling.

## [0.1.0] - 2026-01-23

### Added
- 🎉 Initial release of Android Studio Flash
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
