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
const DeviceTreeProvider_1 = require("./devices/DeviceTreeProvider");
const BuildSystem_1 = require("./build/BuildSystem");
const BuildStatusBar_1 = require("./ui/BuildStatusBar");
const LogcatManager_1 = require("./logcat/LogcatManager");
let deviceManager;
let buildSystem;
let statusBar;
let logcatManager;
async function activate(context) {
    console.log('🚀 Android Studio Lite is now active!');
    try {
        // تهيئة المكونات الأساسية
        const sdkManager = new AndroidSDKManager_1.AndroidSDKManager();
        const gradleService = new GradleService_1.GradleService();
        deviceManager = new DeviceManager_1.DeviceManager();
        buildSystem = new BuildSystem_1.BuildSystem(gradleService, deviceManager);
        logcatManager = new LogcatManager_1.LogcatManager(deviceManager);
        // تهيئة واجهة المستخدم
        statusBar = new BuildStatusBar_1.BuildStatusBar(deviceManager);
        const deviceTreeProvider = new DeviceTreeProvider_1.DeviceTreeProvider(deviceManager);
        // تسجيل Tree View للأجهزة
        vscode.window.registerTreeDataProvider('androidDevices', deviceTreeProvider);
        // تسجيل الأوامر - Build Commands
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
        // أوامر التشغيل
        context.subscriptions.push(vscode.commands.registerCommand('android.runApp', async () => {
            await buildSystem.runApp();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.debugApp', async () => {
            await buildSystem.debugApp();
        }));
        // أوامر الأجهزة
        context.subscriptions.push(vscode.commands.registerCommand('android.selectDevice', async () => {
            await deviceManager.selectDevice();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.refreshDevices', async () => {
            await deviceManager.refreshDevices();
            deviceTreeProvider.refresh();
            statusBar.update();
        }));
        // أوامر Logcat
        context.subscriptions.push(vscode.commands.registerCommand('android.showLogcat', async () => {
            await logcatManager.showLogcat();
        }));
        context.subscriptions.push(vscode.commands.registerCommand('android.clearLogcat', async () => {
            logcatManager.clearLogcat();
        }));
        // تحديث أولي للأجهزة
        await deviceManager.refreshDevices();
        statusBar.update();
        // رسالة ترحيب
        vscode.window.showInformationMessage('✅ Android Studio Lite جاهز للاستخدام!');
    }
    catch (error) {
        vscode.window.showErrorMessage(`❌ خطأ في تهيئة الإضافة: ${error}`);
        console.error('Activation error:', error);
    }
}
function deactivate() {
    console.log('👋 Android Studio Lite is deactivating...');
    if (logcatManager) {
        logcatManager.dispose();
    }
    if (statusBar) {
        statusBar.dispose();
    }
}
//# sourceMappingURL=extension.js.map