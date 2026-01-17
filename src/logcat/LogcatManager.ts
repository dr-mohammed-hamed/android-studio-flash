import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { DeviceManager } from '../devices/DeviceManager';
import { AndroidSDKManager } from '../core/AndroidSDKManager';

export class LogcatManager {
    private outputChannel: vscode.OutputChannel;
    private logcatProcess: ChildProcess | null = null;
    private sdkManager: AndroidSDKManager;
    private isRunning: boolean = false;

    constructor(private deviceManager: DeviceManager) {
        this.outputChannel = vscode.window.createOutputChannel('Android Logcat');
        this.sdkManager = new AndroidSDKManager();
    }

    async showLogcat(): Promise<void> {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        
        if (!selectedDevice) {
            vscode.window.showWarningMessage('⚠️ يرجى اختيار جهاز أولاً');
            return;
        }

        this.outputChannel.show(true);

        if (this.isRunning) {
            return;
        }

        try {
            const adbPath = this.sdkManager.getADBPath();
            
            this.outputChannel.clear();
            this.outputChannel.appendLine(`📱 Logcat from: ${selectedDevice.model || selectedDevice.id}`);

            this.logcatProcess = spawn(adbPath, ['-s', selectedDevice.id, 'logcat', '-v', 'time']);
            this.isRunning = true;

            this.logcatProcess.stdout?.on('data', (data: Buffer) => {
                this.outputChannel.appendLine(data.toString());
            });

            this.logcatProcess.on('close', () => {
                this.isRunning = false;
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل تشغيل Logcat: ${error.message}`);
        }
    }

    clearLogcat(): void {
        this.outputChannel.clear();
    }

    dispose() {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
        }
        this.outputChannel.dispose();
    }
}
