import * as vscode from 'vscode';
import { AndroidSDKManager } from './core/AndroidSDKManager';
import { GradleService } from './core/GradleService';
import { DeviceManager } from './devices/DeviceManager';
import { AndroidTreeProvider } from './ui/AndroidTreeProvider';
import { BuildSystem } from './build/BuildSystem';
import { BuildStatusBar } from './ui/BuildStatusBar';
import { LogcatManager } from './logcat/LogcatManager';
import { WirelessADBManager } from './wireless/WirelessADBManager';

let deviceManager: DeviceManager;
let buildSystem: BuildSystem;
let statusBar: BuildStatusBar;
let logcatManager: LogcatManager;
let treeProvider: AndroidTreeProvider;
let wirelessManager: WirelessADBManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Android Studio Flash is now active!');

    try {
        // Initialize core components
        const sdkManager = new AndroidSDKManager();
        const gradleService = new GradleService();
        deviceManager = new DeviceManager();
        buildSystem = new BuildSystem(gradleService, deviceManager);
        logcatManager = new LogcatManager(deviceManager);
        wirelessManager = new WirelessADBManager(sdkManager.getADBPath(), context);

        // Initialize UI components
        statusBar = new BuildStatusBar(deviceManager);
        treeProvider = new AndroidTreeProvider(deviceManager, buildSystem, logcatManager, wirelessManager);

        // Register Tree View
        vscode.window.registerTreeDataProvider('androidPanel', treeProvider);

        // Register Build Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.buildApk', async () => {
                await buildSystem.buildDebug();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.buildDebug', async () => {
                await buildSystem.buildDebug();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.buildRelease', async () => {
                await buildSystem.buildRelease();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.cleanProject', async () => {
                await buildSystem.cleanProject();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.syncGradle', async () => {
                await gradleService.syncGradle();
            })
        );

        // Run Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.runApp', async () => {
                await buildSystem.runApp();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.debugApp', async () => {
                await buildSystem.debugApp();
            })
        );

        // Device Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectDevice', async () => {
                await deviceManager.selectDevice();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectDeviceFromTree', async (device) => {
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
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.refreshDevices', async () => {
                await deviceManager.refreshDevices();
                treeProvider.refresh();
                statusBar.update();
            })
        );

        // Logcat Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.showLogcat', async () => {
                await logcatManager.showLogcat();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.toggleLogcatFilter', async () => {
                await logcatManager.toggleFilterMode();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.stopLogcat', () => {
                logcatManager.stopLogcat();
                vscode.window.showInformationMessage('⏹️ Logcat stopped');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.clearLogcat', () => {
                logcatManager.clearLogcat();
            })
        );

        // Wireless ADB Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.setupWireless', async () => {
                await wirelessManager.setupWirelessConnection();
                treeProvider.refresh();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.disconnectWireless', async (device) => {
                if (device) {
                    await wirelessManager.disconnectDevice(device);
                    treeProvider.refresh();
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.refreshWireless', async () => {
                await wirelessManager.refreshWirelessDevices();
                treeProvider.refresh();
            })
        );

        // Diagnostics Command
        context.subscriptions.push(
            vscode.commands.registerCommand('android.runDiagnostics', async () => {
                const { runDiagnostics } = require('./utils/diagnostics');
                await runDiagnostics(context);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.forgetWirelessDevice', async (device) => {
                if (device && device.id) {
                    await wirelessManager.removeSavedDevice(device.id);
                    await deviceManager.refreshDevices();
                    treeProvider.refresh();
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.reconnectWirelessDevice', async (device) => {
                if (device && device.ipAddress && device.port) {
                    const endpoint = `${device.ipAddress}:${device.port}`;
                    vscode.window.showInformationMessage(`🔄 Reconnecting to ${endpoint}...`);
                    // Will be handled by attemptReconnect internally
                    await wirelessManager.autoReconnectSavedDevices();
                    await deviceManager.refreshDevices();
                    treeProvider.refresh();
                }
            })
        );

        // Initial device refresh
        // Auto-reconnect saved wireless devices
        await wirelessManager.autoReconnectSavedDevices();
        
        await deviceManager.refreshDevices();
        statusBar.update();

        // Welcome message
        vscode.window.showInformationMessage('✅ Android Studio Flash is ready!');

    } catch (error) {
        vscode.window.showErrorMessage(`❌ Extension initialization error: ${error}`);
        console.error('Activation error:', error);
    }
}

export function deactivate() {
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
