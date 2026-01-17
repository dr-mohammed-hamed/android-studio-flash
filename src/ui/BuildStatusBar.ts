import * as vscode from 'vscode';
import { DeviceManager } from '../devices/DeviceManager';

export class BuildStatusBar {
    private runStatusBarItem: vscode.StatusBarItem;

    constructor(private deviceManager: DeviceManager) {
        // زر Run فقط
        this.runStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.setupStatusBarItems();
        this.update();
        this.show();

        // تحديث عند تغيير الأجهزة
        this.deviceManager.onDidChangeDevices(() => {
            this.update();
        });
    }

    private setupStatusBarItems() {
        // زر Run مع اسم الجهاز
        this.runStatusBarItem.command = 'android.runApp';
        this.runStatusBarItem.tooltip = 'Build and Run on device';
    }

    update() {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        const devices = this.deviceManager.getDevices();

        if (selectedDevice) {
            const icon = selectedDevice.type === 'emulator' ? '$(device-mobile)' : '$(device-camera)';
            const name = selectedDevice.model || selectedDevice.product || selectedDevice.id.substring(0, 10);
            this.runStatusBarItem.text = `${icon} ▶️ Run on ${name}`;
        } else if (devices.length > 0) {
            this.runStatusBarItem.text = '$(warning) ▶️ Run (Select Device)';
        } else {
            this.runStatusBarItem.text = '$(warning) ▶️ Run (No Devices)';
        }
    }

    show() {
        this.runStatusBarItem.show();
    }

    hide() {
        this.runStatusBarItem.hide();
    }

    dispose() {
        this.runStatusBarItem.dispose();
    }
}
