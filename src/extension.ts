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

        // Auto-save newly connected wireless devices
        deviceManager.onDidChangeDevices(async () => {
            const connectedDevices = deviceManager.getDevices();
            for (const device of connectedDevices) {
                if (device.id.includes(':') && (device.state === 'device' || device.state === 'online')) {
                    const [ip, portStr] = device.id.split(':');
                    const port = parseInt(portStr) || 5555;
                    await wirelessManager.addSavedDevice({
                        id: device.id,
                        ipAddress: ip,
                        port: port,
                        connectionType: port === 5555 ? 'tcpip' : 'wireless-debug',
                        model: device.model,
                        product: device.product,
                        device: device.device,
                        state: device.state,
                        type: 'device'
                    });
                }
            }
        });

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
            vscode.commands.registerCommand('android.disconnectWireless', async (arg) => {
                let device: any = null;
                if (arg) {
                    if (arg.device) {
                        device = arg.device;
                    } else if (arg.id) {
                        device = arg;
                    }
                }
                
                if (device) {
                    await wirelessManager.disconnectDevice(device);
                    await deviceManager.refreshDevices();
                    treeProvider.refresh();
                } else {
                    vscode.window.showErrorMessage('❌ Could not identify device to disconnect.');
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
            vscode.commands.registerCommand('android.forgetWirelessDevice', async (arg) => {
                let deviceId: string | undefined;
                if (arg) {
                    if (arg.device && arg.device.id) {
                        deviceId = arg.device.id;
                    } else if (arg.id) {
                        deviceId = arg.id;
                    }
                }
                
                if (deviceId) {
                    await wirelessManager.removeSavedDevice(deviceId);
                    await deviceManager.refreshDevices();
                    treeProvider.refresh();
                } else {
                    vscode.window.showErrorMessage('❌ Could not identify device to forget.');
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.reconnectWirelessDevice', async (arg) => {
                let device: any = null;
                if (arg) {
                    if (arg.device) {
                        device = arg.device;
                    } else if (arg.ipAddress && arg.port) {
                        device = arg;
                    }
                }
                
                if (device && device.ipAddress && device.port) {
                    const endpoint = `${device.ipAddress}:${device.port}`;
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Connecting to ${device.model || endpoint}...`,
                        cancellable: false
                    }, async () => {
                        const success = await wirelessManager.connectSavedDevice(device);
                        if (success) {
                            vscode.window.showInformationMessage(`✅ Connected to ${device.model || endpoint}`);
                        } else {
                            vscode.window.showErrorMessage(`❌ Failed to connect to ${device.model || endpoint}. Please ensure device is on the same network or pair it again.`);
                        }
                        await deviceManager.refreshDevices();
                        treeProvider.refresh();
                    });
                } else {
                    vscode.window.showErrorMessage('❌ Invalid device configuration for reconnection.');
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.copyWirelessIp', async (arg) => {
                let ipAddress: string | undefined;
                if (arg) {
                    if (arg.device && arg.device.ipAddress) {
                        ipAddress = arg.device.ipAddress;
                    } else if (arg.ipAddress) {
                        ipAddress = arg.ipAddress;
                    } else if (arg.device && arg.device.id && arg.device.id.includes(':')) {
                        ipAddress = arg.device.id.split(':')[0];
                    } else if (arg.id && arg.id.includes(':')) {
                        ipAddress = arg.id.split(':')[0];
                    }
                }
                
                if (ipAddress) {
                    await vscode.env.clipboard.writeText(ipAddress);
                    vscode.window.showInformationMessage(`📋 Copied IP Address to Clipboard: ${ipAddress}`);
                } else {
                    vscode.window.showErrorMessage('❌ Could not find IP Address for this device.');
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.showDeviceInfo', async (arg) => {
                let device: any = null;
                if (arg) {
                    if (arg.device) {
                        device = arg.device;
                    } else {
                        device = arg;
                    }
                }
                
                if (!device) {
                    vscode.window.showErrorMessage('❌ Could not identify device to show information.');
                    return;
                }

                const isWireless = device.id.includes(':') || !!device.ipAddress;
                const isEmulator = device.id.startsWith('emulator-') || device.type === 'emulator';
                
                let connectionTypeLabel = 'USB Connection';
                if (isEmulator) {
                    connectionTypeLabel = 'Android Virtual Device (Emulator)';
                } else if (isWireless) {
                    const port = device.port || (device.id.includes(':') ? parseInt(device.id.split(':')[1]) : 5555);
                    connectionTypeLabel = port === 5555 ? 'Wireless (ADB over TCP/IP)' : 'Wireless Debugging (Android 11+)';
                }

                let ipAddress = device.ipAddress;
                let port = device.port;
                if (isWireless && (!ipAddress || !port)) {
                    const parts = device.id.split(':');
                    ipAddress = parts[0];
                    port = parseInt(parts[1]) || 5555;
                }

                const details = [
                    `📱 Device Info: ${device.model || device.product || 'Unknown'}`,
                    `• Model: ${device.model || 'Unknown'}`,
                    `• Product: ${device.product || 'Unknown'}`,
                    `• Device ID/Serial: ${device.id}`,
                    `• Connection Type: ${connectionTypeLabel}`,
                    `• Current State: ${device.state || 'Unknown'}`
                ];

                if (isWireless && ipAddress) {
                    details.push(`• IP Address: ${ipAddress}`);
                    details.push(`• ADB Port: ${port}`);
                }

                vscode.window.showInformationMessage(
                    details[0] + '\n\n' + details.slice(1).join('\n'),
                    { modal: true }
                );
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
