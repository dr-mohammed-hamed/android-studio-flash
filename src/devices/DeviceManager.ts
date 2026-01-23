import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AndroidSDKManager } from '../core/AndroidSDKManager';

const execAsync = promisify(exec);

/**
 * Represents an Android device (physical or emulator)
 */
export interface AndroidDevice {
    id: string;
    type: 'emulator' | 'device';
    state: 'device' | 'online' | 'offline' | 'unauthorized';
    model?: string;
    product?: string;
    device?: string;
}

/**
 * Manages Android device detection, selection, and operations.
 */
export class DeviceManager {
    private devices: AndroidDevice[] = [];
    private selectedDevice: AndroidDevice | null = null;
    private sdkManager: AndroidSDKManager;
    private onDidChangeDevicesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeDevices = this.onDidChangeDevicesEmitter.event;

    constructor() {
        this.sdkManager = new AndroidSDKManager();
    }

    /**
     * Refresh the list of connected devices
     */
    async refreshDevices(): Promise<void> {
        try {
            const adbPath = this.sdkManager.getADBPath();
            const { stdout } = await execAsync(`"${adbPath}" devices -l`);
            
            this.devices = [];
            const lines = stdout.split('\n');
            
            for (const line of lines) {
                if (line && !line.startsWith('List of devices') && line.trim()) {
                    // Example line:
                    // 5cda021f               device usb:1-1 product:RMX2061 model:RMX2061 device:RMX2061L1
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const device: AndroidDevice = {
                            id: parts[0],
                            type: parts[0].startsWith('emulator-') ? 'emulator' : 'device',
                            state: parts[1] as any
                        };
                        
                        // Extract additional info from rest of line
                        // Looking for: model:xxx product:xxx device:xxx
                        const modelMatch = line.match(/model:([^\s]+)/);
                        const productMatch = line.match(/product:([^\s]+)/);
                        const deviceMatch = line.match(/device:([^\s]+)/);
                        
                        if (modelMatch) {
                            device.model = modelMatch[1].replace(/_/g, ' '); // Replace _ with spaces
                        }
                        if (productMatch) {
                            device.product = productMatch[1];
                        }
                        if (deviceMatch) {
                            device.device = deviceMatch[1];
                        }
                        
                        this.devices.push(device);
                    }
                }
            }


            if (!this.selectedDevice && this.devices.length > 0) {
                this.selectedDevice = this.devices[0];
            }


            this.onDidChangeDevicesEmitter.fire();
        } catch(error: any) {
            console.error('❌ Failed to refresh devices:', error);
            console.error('Error details:', error.message);
            
            this.devices = [];
            
            // Notify user of error
            vscode.window.showErrorMessage(
                `❌ Failed to refresh devices: ${error.message}\n\n` +
                'Possible causes:\n' +
                '• Android SDK not installed or not detected\n' +
                '• ADB not found in platform-tools\n' +
                '• Device not connected or USB Debugging not enabled'
            );
        }
    }

    /**
     * Get list of connected devices
     */
    getDevices(): AndroidDevice[] {
        return this.devices;
    }

    /**
     * Get currently selected device
     */
    getSelectedDevice(): AndroidDevice | null {
        return this.selectedDevice;
    }

    /**
     * Show device selection dialog
     */
    async selectDevice(): Promise<void> {
        if (this.devices.length === 0) {
            vscode.window.showWarningMessage('⚠️ No devices connected!');
            return;
        }

        const items = this.devices.map(device => ({
            label: this.getDeviceDisplayName(device),
            description: device.id,
            device: device
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a device'
        });

        if (selected) {
            this.selectedDevice = selected.device;
            this.onDidChangeDevicesEmitter.fire();
        }
    }

    /**
     * Get display name for a device
     */
    getDeviceDisplayName(device: AndroidDevice): string {
        const icon = device.type === 'emulator' ? '📱' : '🔌';
        const status = device.state === 'online' || device.state === 'device' ? '🟢' : '🔴';
        
        // Show real device name (model or product) instead of ID
        const name = device.model || device.product || device.device || device.id;
        
        return `${status} ${icon} ${name}`;
    }

    /**
     * Install APK on selected device
     */
    async installApk(apkPath: string): Promise<void> {
        const device = this.selectedDevice;
        if (!device) throw new Error('No device selected');

        const adbPath = this.sdkManager.getADBPath();
        await execAsync(`"${adbPath}" -s ${device.id} install -r "${apkPath}"`);
    }

    /**
     * Launch app on selected device
     */
    async launchApp(packageName: string, activityName: string): Promise<void> {
        const device = this.selectedDevice;
        if (!device) throw new Error('No device selected');

        const adbPath = this.sdkManager.getADBPath();
        const fullActivity = `${packageName}/${activityName}`;
        await execAsync(`"${adbPath}" -s ${device.id} shell am start -n ${fullActivity}`);
    }

    /**
     * Get package name from APK
     * TODO: Implement proper APK parsing using aapt
     */
    async getPackageName(apkPath: string): Promise<string> {
        return 'com.example.app'; // Simplified for now
    }

    dispose() {
        this.onDidChangeDevicesEmitter.dispose();
    }
}
