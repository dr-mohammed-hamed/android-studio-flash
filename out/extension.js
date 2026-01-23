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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const AndroidSDKManager_1 = require("./core/AndroidSDKManager");
const GradleService_1 = require("./core/GradleService");
const DeviceManager_1 = require("./devices/DeviceManager");
const AndroidTreeProvider_1 = require("./ui/AndroidTreeProvider");
const BuildSystem_1 = require("./build/BuildSystem");
const BuildStatusBar_1 = require("./ui/BuildStatusBar");
const LogcatManager_1 = require("./logcat/LogcatManager");
const WirelessADBManager_1 = require("./wireless/WirelessADBManager");
let deviceManager;
let buildSystem;
let statusBar;
let logcatManager;
let treeProvider;
let wirelessManager;
async function activate(context) {
    console.log('🚀 Android Studio Flash is now active!');
    try {
        // Initialize core components
        const sdkManager = new AndroidSDKManager_1.AndroidSDKManager();
        const gradleService = new GradleService_1.GradleService();
        deviceManager = new DeviceManager_1.DeviceManager();
        buildSystem = new BuildSystem_1.BuildSystem(gradleService, deviceManager);
        logcatManager = new LogcatManager_1.LogcatManager(deviceManager);
        wirelessManager = new WirelessADBManager_1.WirelessADBManager(sdkManager.getADBPath(), context);
        // Initialize UI components
        statusBar = new BuildStatusBar_1.BuildStatusBar(deviceManager);
        treeProvider = new AndroidTreeProvider_1.AndroidTreeProvider(deviceManager, buildSystem, logcatManager, wirelessManager);
        // Register Tree View
        vscode.window.registerTreeDataProvider('androidPanel', treeProvider);
        // Register Build Commands
        context.subscriptions.push(vscode.commands.registerCommand('android.buildApk', async () => {
            await buildSystem.buildDebug();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.buildDebug', async () => {
            await buildSystem.buildDebug();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.buildRelease', async () => {
            await buildSystem.buildRelease();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.cleanProject', async () => {
            await buildSystem.cleanProject();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.syncGradle', async () => {
            await gradleService.syncGradle();
        }));
        // Run Commands
        context.subscriptions.push(vscode.commands.registerCommand('android.runApp', async () => {
            await buildSystem.runApp();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.debugApp', async () => {
            await buildSystem.debugApp();
        }));
        // Device Commands
        context.subscriptions.push(vscode.commands.registerCommand('android.selectDevice', async () => {
            await deviceManager.selectDevice();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.selectDeviceFromTree', async (device) => {
            // Select device directly from Tree
            if (device) {
                deviceManager.getDevices().forEach(d => {
                    if (d.id === device.id) {
                        deviceManager['selectedDevice'] = d;
                        deviceManager['onDidChangeDevicesEmitter'].fire();
                    }
                });
                statusBar.update();
                treeProvider.refresh();
                vscode.window.showInformationMessage(`✅ Selected: ${device.id}`);
            }
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.refreshDevices', async () => {
            await deviceManager.refreshDevices();
            treeProvider.refresh();
            statusBar.update();
        }));
        // Logcat Commands
        context.subscriptions.push(vscode.commands.registerCommand('android.showLogcat', async () => {
            await logcatManager.showLogcat();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.toggleLogcatFilter', async () => {
            await logcatManager.toggleFilterMode();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.stopLogcat', () => {
            logcatManager.stopLogcat();
            vscode.window.showInformationMessage('⏹️ Logcat stopped');
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.clearLogcat', () => {
            logcatManager.clearLogcat();
        }));
        // Wireless ADB Commands
        context.subscriptions.push(vscode.commands.registerCommand('android.setupWireless', async () => {
            await wirelessManager.setupWirelessConnection();
            treeProvider.refresh();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.disconnectWireless', async (device) => {
            if (device) {
                await wirelessManager.disconnectDevice(device);
                treeProvider.refresh();
            }
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.refreshWireless', async () => {
            await wirelessManager.refreshWirelessDevices();
            treeProvider.refresh();
        }));
        // Diagnostics Command
        context.subscriptions.push(vscode.commands.registerCommand('android.runDiagnostics', async () => {
            const { runDiagnostics } = require('./utils/diagnostics');
            await runDiagnostics(context);
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.forgetWirelessDevice', async (device) => {
            if (device && device.id) {
                await wirelessManager.removeSavedDevice(device.id);
                await deviceManager.refreshDevices();
                treeProvider.refresh();
            }
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.reconnectWirelessDevice', async (device) => {
            if (device && device.ipAddress && device.port) {
                const endpoint = `${device.ipAddress}:${device.port}`;
                vscode.window.showInformationMessage(`🔄 Reconnecting to ${endpoint}...`);
                // Will be handled by attemptReconnect internally
                await wirelessManager.autoReconnectSavedDevices();
                await deviceManager.refreshDevices();
                treeProvider.refresh();
            }
        }));
        // Initial device refresh
        // Auto-reconnect saved wireless devices
        await wirelessManager.autoReconnectSavedDevices();
        await deviceManager.refreshDevices();
        statusBar.update();
        // Welcome message
        vscode.window.showInformationMessage('✅ Android Studio Flash is ready!');
    }
    catch (error) {
        vscode.window.showErrorMessage(`❌ Extension initialization error: ${error}`);
        console.error('Activation error:', error);
    }
}
function deactivate() {
    console.log('👋 Android Studio Flash is deactivating...');
    if (logcatManager) {
        logcatManager.dispose();
    }
    if (statusBar) {
        statusBar.dispose();
    }
    if (wirelessManager) {
        wirelessManager.dispose();
    }
}
//# sourceMappingURL=extension.js.map