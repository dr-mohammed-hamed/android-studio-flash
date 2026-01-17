import * as vscode from 'vscode';
import { AndroidSDKManager } from './core/AndroidSDKManager';
import { GradleService } from './core/GradleService';
import { DeviceManager } from './devices/DeviceManager';
import { AndroidTreeProvider } from './ui/AndroidTreeProvider';
import { BuildSystem } from './build/BuildSystem';
import { BuildStatusBar } from './ui/BuildStatusBar';
import { LogcatManager } from './logcat/LogcatManager';

let deviceManager: DeviceManager;
let buildSystem: BuildSystem;
let statusBar: BuildStatusBar;
let logcatManager: LogcatManager;
let treeProvider: AndroidTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Android Studio Lite is now active!');

    try {
        // تهيئة المكونات الأساسية
        const sdkManager = new AndroidSDKManager();
        const gradleService = new GradleService();
        deviceManager = new DeviceManager();
        buildSystem = new BuildSystem(gradleService, deviceManager);
        logcatManager = new LogcatManager(deviceManager);

        // تهيئة واجهة المستخدم
        statusBar = new BuildStatusBar(deviceManager);
        treeProvider = new AndroidTreeProvider(deviceManager, buildSystem, logcatManager);

        // تسجيل Tree View
        vscode.window.registerTreeDataProvider('androidPanel', treeProvider);

        // تسجيل الأوامر - Build Commands
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

        // أوامر التشغيل
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

        // أوامر الأجهزة
        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectDevice', async () => {
                await deviceManager.selectDevice();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('android.selectDeviceFromTree', async (device) => {
                // تحديد الجهاز مباشرة من Tree
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

        // أوامر Logcat
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

        // تحديث أولي للأجهزة
        await deviceManager.refreshDevices();
        statusBar.update();

        // رسالة ترحيب
        vscode.window.showInformationMessage('✅ Android Studio Lite جاهز للاستخدام!');

    } catch (error) {
        vscode.window.showErrorMessage(`❌ خطأ في تهيئة الإضافة: ${error}`);
        console.error('Activation error:', error);
    }
}

export function deactivate() {
    console.log('👋 Android Studio Lite is deactivating...');
    
    if (logcatManager) {
        logcatManager.dispose();
    }
    
    if (statusBar) {
        statusBar.dispose();
    }
}
