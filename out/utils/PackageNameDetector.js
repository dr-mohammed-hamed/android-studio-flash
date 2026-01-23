"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageNameDetector = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Smart package name detection from multiple sources.
 * Prioritizes built APK, then Gradle, then foreground app.
 */
class PackageNameDetector {
    /**
     * Smart system: Try all methods in order (best for developers)
     */
    static async detectPackageNameSmart(adbPath, deviceId, gradlePath) {
        const results = [];
        // Priority 1: From built APK (most accurate - 100%)
        // Developer wants to debug the app they built!
        if (gradlePath) {
            const apkPackage = await this.getPackageFromBuiltApk(gradlePath);
            if (apkPackage) {
                results.push({
                    packageName: apkPackage,
                    source: 'apk',
                    confidence: 'high'
                });
            }
        }
        // Priority 2: From build.gradle with Build Variants (very good)
        const gradlePackage = await this.detectPackageName();
        if (gradlePackage) {
            results.push({
                packageName: gradlePackage,
                source: 'gradle',
                confidence: 'high'
            });
        }
        // Priority 3: From foreground app on device (informational only)
        // Can be useful, but not priority for developers
        if (adbPath && deviceId) {
            const foregroundPackage = await this.getForegroundPackage(adbPath, deviceId);
            if (foregroundPackage) {
                // Only add if not already in results
                if (!results.find(r => r.packageName === foregroundPackage)) {
                    results.push({
                        packageName: foregroundPackage,
                        source: 'foreground',
                        confidence: 'medium'
                    });
                }
            }
        }
        // Priority 4: Search device for matching packages
        if (adbPath && deviceId && gradlePackage) {
            const devicePackages = await this.findMatchingPackageOnDevice(adbPath, deviceId, gradlePackage);
            devicePackages.forEach(pkg => {
                if (!results.find(r => r.packageName === pkg)) {
                    results.push({
                        packageName: pkg,
                        source: 'device',
                        confidence: 'medium'
                    });
                }
            });
        }
        return results;
    }
    /**
     * Get Package Name from built APK (most accurate!)
     */
    static async getPackageFromBuiltApk(projectRoot) {
        try {
            // Search for APK in common build paths
            const apkPaths = [
                path.join(projectRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
                path.join(projectRoot, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
                path.join(projectRoot, 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
            ];
            console.log('🔍 Searching for built APK...');
            for (const apkPath of apkPaths) {
                console.log(`  Checking: ${apkPath}`);
                if (fs.existsSync(apkPath)) {
                    console.log(`✅ Found APK: ${apkPath}`);
                    const packageName = await this.extractPackageFromApk(apkPath);
                    if (packageName) {
                        console.log(`✅ Package from built APK (${path.basename(apkPath)}): ${packageName}`);
                        return packageName;
                    }
                    else {
                        console.log(`⚠️ Failed to extract package from ${path.basename(apkPath)}`);
                    }
                }
                else {
                    console.log(`  Not found`);
                }
            }
            console.log('ℹ️ No built APK found. Build the project first!');
        }
        catch (error) {
            console.error('❌ Error getting package from built APK:', error);
        }
        return null;
    }
    /**
     * Extract Package Name from APK using aapt
     */
    static async extractPackageFromApk(apkPath) {
        try {
            // Try 1: Use aapt from Android SDK
            const sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
            if (sdkPath) {
                // Search in build-tools (using fs instead of exec to avoid memory leak)
                const buildToolsPath = path.join(sdkPath, 'build-tools');
                if (fs.existsSync(buildToolsPath)) {
                    const buildToolVersions = fs.readdirSync(buildToolsPath).sort().reverse();
                    for (const version of buildToolVersions) {
                        const aaptExe = process.platform === 'win32' ? 'aapt.exe' : 'aapt';
                        const aaptPath = path.join(buildToolsPath, version, aaptExe);
                        if (fs.existsSync(aaptPath)) {
                            console.log(`✅ Found aapt: ${aaptPath}`);
                            try {
                                const { stdout } = await execAsync(`"${aaptPath}" dump badging "${apkPath}"`);
                                const match = stdout.match(/package:\s*name='([^']+)'/);
                                if (match && match[1]) {
                                    console.log(`✅ Extracted package: ${match[1]}`);
                                    return match[1];
                                }
                            }
                            catch (error) {
                                console.log(`⚠️ aapt failed: ${error.message}`);
                            }
                            break; // Found aapt, no need to search more
                        }
                    }
                }
            }
            // Try 2: aapt from PATH (simple)
            try {
                const { stdout } = await execAsync(`aapt dump badging "${apkPath}"`);
                const match = stdout.match(/package:\s*name='([^']+)'/);
                if (match && match[1]) {
                    console.log(`✅ Extracted package using aapt from PATH`);
                    return match[1];
                }
            }
            catch (error) {
                // aapt not in PATH
            }
            console.log(`💡 Tip: aapt not found. Install Android SDK build-tools`);
        }
        catch (error) {
            console.error('Error extracting package from APK:', error);
        }
        return null;
    }
    /**
     * Get Package Name of foreground app (currently running)
     */
    static async getForegroundPackage(adbPath, deviceId) {
        try {
            // Method 1: dumpsys window (most reliable)
            const { stdout } = await execAsync(`"${adbPath}" -s ${deviceId} shell "dumpsys window | grep mCurrentFocus"`);
            // Look for: mCurrentFocus=Window{... u0 com.example.app/...}
            const match = stdout.match(/mCurrentFocus=Window\{[^}]*\s+u\d+\s+([^\s\/]+)/);
            if (match && match[1]) {
                console.log(`✅ Foreground package: ${match[1]}`);
                return match[1];
            }
            // Method 2: dumpsys activity (alternative)
            const { stdout: activityOut } = await execAsync(`"${adbPath}" -s ${deviceId} shell "dumpsys activity activities | grep mResumedActivity"`);
            const activityMatch = activityOut.match(/u\d+\s+([^\s\/]+)/);
            if (activityMatch && activityMatch[1]) {
                console.log(`✅ Foreground package (from activity): ${activityMatch[1]}`);
                return activityMatch[1];
            }
        }
        catch (error) {
            console.error('Error getting foreground package:', error);
        }
        return null;
    }
    /**
     * Extract Package Name from project (with Build Variants support)
     */
    static async detectPackageName() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }
        const projectRoot = workspaceFolder.uri.fsPath;
        // Try 1: From build.gradle with Build Variants
        const packageFromGradle = await this.extractFromBuildGradle(projectRoot);
        if (packageFromGradle) {
            return packageFromGradle;
        }
        // Try 2: From AndroidManifest.xml
        const packageFromManifest = await this.extractFromManifest(projectRoot);
        if (packageFromManifest) {
            return packageFromManifest;
        }
        return null;
    }
    /**
     * Extract from build.gradle with Build Variants support
     */
    static async extractFromBuildGradle(projectRoot) {
        const buildGradlePaths = [
            path.join(projectRoot, 'app', 'build.gradle'),
            path.join(projectRoot, 'app', 'build.gradle.kts'),
            path.join(projectRoot, 'build.gradle'),
            path.join(projectRoot, 'build.gradle.kts')
        ];
        for (const gradlePath of buildGradlePaths) {
            if (fs.existsSync(gradlePath)) {
                try {
                    const content = fs.readFileSync(gradlePath, 'utf-8');
                    // Look for base applicationId
                    const basePackageMatch = content.match(/applicationId\s+["']([^"']+)["']/);
                    const namespaceMatch = content.match(/namespace\s*=\s*["']([^"']+)["']/);
                    const basePackage = basePackageMatch?.[1] || namespaceMatch?.[1];
                    if (basePackage) {
                        // Look for applicationIdSuffix for debug
                        const debugSuffixMatch = content.match(/debug\s*{[^}]*applicationIdSuffix\s+["']([^"']+)["']/s);
                        if (debugSuffixMatch && debugSuffixMatch[1]) {
                            // If debug suffix found
                            const debugPackage = basePackage + debugSuffixMatch[1];
                            console.log(`✅ Found debug package: ${debugPackage} (base: ${basePackage})`);
                            return debugPackage;
                        }
                        console.log(`✅ Package name found: ${basePackage}`);
                        return basePackage;
                    }
                }
                catch (error) {
                    console.error(`Error reading ${gradlePath}:`, error);
                }
            }
        }
        return null;
    }
    /**
     * Extract from AndroidManifest.xml
     */
    static async extractFromManifest(projectRoot) {
        const manifestPaths = [
            path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml'),
            path.join(projectRoot, 'src', 'main', 'AndroidManifest.xml'),
            path.join(projectRoot, 'AndroidManifest.xml')
        ];
        for (const manifestPath of manifestPaths) {
            if (fs.existsSync(manifestPath)) {
                try {
                    const content = fs.readFileSync(manifestPath, 'utf-8');
                    const match = content.match(/package\s*=\s*["']([^"']+)["']/);
                    if (match && match[1]) {
                        console.log(`✅ Package name found in manifest: ${match[1]}`);
                        return match[1];
                    }
                }
                catch (error) {
                    console.error(`Error reading ${manifestPath}:`, error);
                }
            }
        }
        return null;
    }
    /**
     * Get Package Name from APK (public wrapper)
     */
    static async getPackageFromApk(apkPath) {
        return await this.extractPackageFromApk(apkPath);
    }
    /**
     * Get list of installed packages on device
     */
    static async getInstalledPackages(adbPath, deviceId) {
        try {
            const { stdout } = await execAsync(`"${adbPath}" -s ${deviceId} shell pm list packages`);
            const packages = stdout
                .split('\n')
                .filter(line => line.startsWith('package:'))
                .map(line => line.replace('package:', '').trim())
                .filter(pkg => pkg.length > 0);
            return packages;
        }
        catch (error) {
            console.error('Error getting installed packages:', error);
            return [];
        }
    }
    /**
     * Find matching Package Names on device
     */
    static async findMatchingPackageOnDevice(adbPath, deviceId, basePackage) {
        const allPackages = await this.getInstalledPackages(adbPath, deviceId);
        // Find packages starting with base name
        const matches = allPackages.filter(pkg => pkg.startsWith(basePackage));
        return matches;
    }
    /**
     * Show Package Names with sources in Quick Pick
     */
    static async promptForPackageName(detectionResults) {
        const items = [];
        // Sort results by confidence
        const sortedResults = detectionResults.sort((a, b) => {
            const confidenceOrder = { high: 0, medium: 1, low: 2 };
            return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
        });
        // Show results with icons by source
        sortedResults.forEach((result, index) => {
            const icons = {
                apk: '📦',
                foreground: '▶️',
                gradle: '⚙️',
                manifest: '📄',
                device: '📱'
            };
            const descriptions = {
                apk: 'From built APK (100% accurate)',
                foreground: 'Currently foreground app',
                gradle: 'From build.gradle',
                manifest: 'From AndroidManifest.xml',
                device: 'Installed on device'
            };
            items.push({
                label: `${icons[result.source]} ${result.packageName}`,
                description: descriptions[result.source],
                packageName: result.packageName,
                picked: index === 0, // Select first (highest confidence)
                detail: result.confidence === 'high' ? '✅ Recommended' : ''
            });
        });
        // Remove duplicates
        const uniqueItems = items.filter((item, index, self) => index === self.findIndex(t => t.packageName === item.packageName));
        // Separator
        uniqueItems.push({
            label: '─'.repeat(50),
            kind: vscode.QuickPickItemKind.Separator
        });
        // Manual input option
        uniqueItems.push({
            label: '$(edit) Enter Package Name manually',
            description: 'For custom input',
            packageName: null
        });
        const selected = await vscode.window.showQuickPick(uniqueItems, {
            placeHolder: 'Select Package Name (sorted by accuracy)'
        });
        if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) {
            return null;
        }
        if (selected.packageName) {
            return selected.packageName;
        }
        // Manual input
        const input = await vscode.window.showInputBox({
            prompt: 'Enter application Package Name',
            placeHolder: 'com.example.app'
        });
        return input || null;
    }
}
exports.PackageNameDetector = PackageNameDetector;
//# sourceMappingURL=PackageNameDetector.js.map