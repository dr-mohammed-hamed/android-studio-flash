import * as vscode from 'vscode';
import { AndroidSDKManager } from './core/AndroidSDKManager';
import { GradleService } from './core/GradleService';
import { GradleModuleService } from './core/GradleModuleService';
import { DeviceManager } from './devices/DeviceManager';
import { AndroidTreeProvider } from './ui/AndroidTreeProvider';
import { BuildSystem } from './build/BuildSystem';
import { BuildStatusBar } from './ui/BuildStatusBar';
import { LogcatManager } from './logcat/LogcatManager';
import { WirelessADBManager } from './wireless/WirelessADBManager';
import { KeystoreManager } from './signing/KeystoreManager';
import { SigningWizard } from './signing/SigningWizard';

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
        const gradleService = new GradleService(sdkManager);
        const gradleModuleService = new GradleModuleService(); // New Service
        deviceManager = new DeviceManager();
        buildSystem = new BuildSystem(gradleService, deviceManager);
        logcatManager = new LogcatManager(deviceManager);
        wirelessManager = new WirelessADBManager(sdkManager.getADBPath(), context);

        // Initialize signing components
        const keystoreManager = new KeystoreManager(context);
        const signingWizard = new SigningWizard(keystoreManager);
        buildSystem.setSigningWizard(signingWizard);

        // Initialize UI components
        statusBar = new BuildStatusBar(deviceManager);
        treeProvider = new AndroidTreeProvider(
            deviceManager, 
            buildSystem, 
            logcatManager, 
            wirelessManager,
            gradleService,
            gradleModuleService
        );

        // Module Selection Status Bar
        const moduleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        moduleStatusBar.command = 'android.selectModule';
        context.subscriptions.push(moduleStatusBar);

        // Restore saved module selection
        const savedModule = context.workspaceState.get<string>('android-studio-flash.selectedModule');
        if (savedModule) {
            gradleService.setTargetModule(savedModule);
            moduleStatusBar.text = `$(package) Module: ${savedModule}`;
        } else {
            moduleStatusBar.text = '$(package) Module: (Project Root)';
        }
        moduleStatusBar.show();

        // Register Tree View
        vscode.window.registerTreeDataProvider('androidPanel', treeProvider);

        // Register Build Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.buildApk', async () => {
                await buildSystem.buildDebug();
            })
        );

        // ... [Existing Commands] ...

        // NEW: Select Module Command
        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectModule', async () => {
                try {
                    const root = gradleService.findProjectRoot();
                    const modules = await gradleModuleService.getModules(root);
                    
                    if (modules.length === 0) {
                        vscode.window.showInformationMessage('No modules found in settings.gradle');
                        return;
                    }

                    const selected = await vscode.window.showQuickPick(modules, {
                        placeHolder: 'Select Gradle Module to Build',
                        title: 'Select Active Module'
                    });

                    if (selected) {
                        // Save state
                        await context.workspaceState.update('android-studio-flash.selectedModule', selected);
                        
                        // Update Service
                        gradleService.setTargetModule(selected);
                        
                        // Update UI
                        moduleStatusBar.text = `$(package) Module: ${selected}`;
                        vscode.window.showInformationMessage(`✅ Active Module: ${selected}`);
                        
                        // Refresh Tree to show checkmark
                        treeProvider.refresh();
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to select module: ${error.message}`);
                }
            })
        );

        // NEW: Select Module Directly from Tree
        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectModuleFromTree', async (moduleName: string) => {
                if (moduleName) {
                    // Update Service
                    gradleService.setTargetModule(moduleName);
                    
                    // Save state
                    await context.workspaceState.update('android-studio-flash.selectedModule', moduleName);

                    // Update UI
                    moduleStatusBar.text = `$(package) Module: ${moduleName}`;
                    
                    // Refresh Tree to show checkmark
                    treeProvider.refresh();
                }
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

        // Signing Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('android.createKeystore', async () => {
                await keystoreManager.createKeystore();
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
