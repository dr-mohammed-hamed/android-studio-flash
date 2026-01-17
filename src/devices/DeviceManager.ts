import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { AndroidSDKManager } from '../core/AndroidSDKManager';

const execAsync = promisify(exec);

export interface AndroidDevice {
    id: string;
    type: 'emulator' | 'device';
    state: 'device' | 'online' | 'offline' | 'unauthorized';
    model?: string;
    product?: string;
    device?: string;
}

export class DeviceManager {
    private devices: AndroidDevice[] = [];
    private selectedDevice: AndroidDevice | null = null;
    private sdkManager: AndroidSDKManager;
    private onDidChangeDevicesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeDevices = this.onDidChangeDevicesEmitter.event;

    constructor() {
        this.sdkManager = new AndroidSDKManager();
    }

    async refreshDevices(): Promise<void> {
        try {
            const adbPath = this.sdkManager.getADBPath();
            const { stdout } = await execAsync(`"${adbPath}" devices -l`);
            
            this.devices = [];
            const lines = stdout.split('\n');
            
            for (const line of lines) {
                if (line && !line.startsWith('List of devices') && line.trim()) {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const device: AndroidDevice = {
                            id: parts[0],
                            type: parts[0].startsWith('emulator-') ? 'emulator' : 'device',
                            state: parts[1] as any
                        };
                        this.devices.push(device);
                    }
                }
            }

            if (!this.selectedDevice && this.devices.length > 0) {
                this.selectedDevice = this.devices[0];
            }

            this.onDidChangeDevicesEmitter.fire();
        } catch(error) {
            this.devices = [];
        }
    }

    getDevices(): AndroidDevice[] {
        return this.devices;
    }

    getSelectedDevice(): AndroidDevice | null {
        return this.selectedDevice;
    }

    async selectDevice(): Promise<void> {
        if (this.devices.length === 0) {
            vscode.window.showWarningMessage('⚠️ لا توجد أجهزة متصلة!');
            return;
        }

        const items = this.devices.map(device => ({
            label: this.getDeviceDisplayName(device),
            description: device.id,
            device: device
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'اختر جهازاً'
        });

        if (selected) {
            this.selectedDevice = selected.device;
            this.onDidChangeDevicesEmitter.fire();
        }
    }

    getDeviceDisplayName(device: AndroidDevice): string {
        const icon = device.type === 'emulator' ? '📱' : '🔌';
        const status = device.state === 'online' || device.state === 'device' ? '🟢' : '🔴';
        return `${status} ${icon} ${device.id}`;
    }

    async installApk(apkPath: string): Promise<void> {
        const device = this.selectedDevice;
        if (!device) throw new Error('No device selected');

        const adbPath = this.sdkManager.getADBPath();
        await execAsync(`"${adbPath}" -s ${device.id} install -r "${apkPath}"`);
    }

    async launchApp(packageName: string, activityName: string): Promise<void> {
        const device = this.selectedDevice;
        if (!device) throw new Error('No device selected');

        const adbPath = this.sdkManager.getADBPath();
        const fullActivity = `${packageName}/${activityName}`;
        await execAsync(`"${adbPath}" -s ${device.id} shell am start -n ${fullActivity}`);
    }

    async getPackageName(apkPath: string): Promise<string> {
        return 'com.example.app'; // مبسط للآن
    }

    dispose() {
        this.onDidChangeDevicesEmitter.dispose();
    }
}
