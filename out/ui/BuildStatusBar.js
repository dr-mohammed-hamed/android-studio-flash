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
exports.BuildStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class BuildStatusBar {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        // إنشاء عناصر Status Bar
        this.deviceStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.buildStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.runStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        this.debugStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        this.logcatStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
        this.setupStatusBarItems();
        this.update();
        this.show();
        // تحديث عند تغيير الأجهزة
        this.deviceManager.onDidChangeDevices(() => {
            this.update();
        });
    }
    setupStatusBarItems() {
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
        }
        else if (devices.length > 0) {
            this.deviceStatusBarItem.text = '$(device-mobile) Select Device';
        }
        else {
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
exports.BuildStatusBar = BuildStatusBar;
//# sourceMappingURL=BuildStatusBar.js.map