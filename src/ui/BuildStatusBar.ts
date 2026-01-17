import * as vscode from 'vscode';
import { DeviceManager } from '../devices/DeviceManager';

export class BuildStatusBar {
    private deviceStatusBarItem: vscode.StatusBarItem;
    private buildStatusBarItem: vscode.StatusBarItem;
    private runStatusBarItem: vscode.StatusBarItem;
    private debugStatusBarItem: vscode.StatusBarItem;
    private logcatStatusBarItem: vscode.StatusBarItem;

    constructor(private deviceManager: DeviceManager) {
        // إنشاء عناصر Status Bar
        this.deviceStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.buildStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.runStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            98
        );
        this.debugStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            97
        );
        this.logcatStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            96
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
        // زر اختيار الجهاز
        this.deviceStatusBarItem.command = 'android.selectDevice';
        this.deviceStatusBarItem.tooltip = 'اختر جهازاً';

        // زر البناء
        this.buildStatusBarItem.text = '$(tools) Build';
        this.buildStatusBarItem.command = 'android.buildApk';
        this.buildStatusBarItem.tooltip = 'Build APK';

        // زر التشغيل
        this.runStatusBarItem.text = '$(play) Run';
        this.runStatusBarItem.command = 'android.runApp';
        this.runStatusBarItem.tooltip = 'Run on device';

        // زر التصحيح
        this.debugStatusBarItem.text = '$(bug) Debug';
        this.debugStatusBarItem.command = 'android.debugApp';
        this.debugStatusBarItem.tooltip = 'Debug on device';

        // زر Logcat
        this.logcatStatusBarItem.text = '$(output) Logcat';
        this.logcatStatusBarItem.command = 'android.showLogcat';
        this.logcatStatusBarItem.tooltip = 'Show Logcat';
    }

    update() {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        const devices = this.deviceManager.getDevices();

        if (selectedDevice) {
            const icon = selectedDevice.type === 'emulator' ? '$(device-mobile)' : '$(device-camera)';
            const name = selectedDevice.model || selectedDevice.product || selectedDevice.id.substring(0, 10);
            this.deviceStatusBarItem.text = `${icon} ${name}`;
        } else if (devices.length > 0) {
            this.deviceStatusBarItem.text = '$(device-mobile) Select Device';
        } else {
            this.deviceStatusBarItem.text = '$(warning) No Devices';
        }
    }

    show() {
        this.deviceStatusBarItem.show();
        this.buildStatusBarItem.show();
        this.runStatusBarItem.show();
        this.debugStatusBarItem.show();
        this.logcatStatusBarItem.show();
    }

    hide() {
        this.deviceStatusBarItem.hide();
        this.buildStatusBarItem.hide();
        this.runStatusBarItem.hide();
        this.debugStatusBarItem.hide();
        this.logcatStatusBarItem.hide();
    }

    dispose() {
        this.deviceStatusBarItem.dispose();
        this.buildStatusBarItem.dispose();
        this.runStatusBarItem.dispose();
        this.debugStatusBarItem.dispose();
        this.logcatStatusBarItem.dispose();
    }
}
