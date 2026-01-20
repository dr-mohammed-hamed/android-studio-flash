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
exports.DeviceManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const AndroidSDKManager_1 = require("../core/AndroidSDKManager");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class DeviceManager {
    constructor() {
        this.devices = [];
        this.selectedDevice = null;
        this.onDidChangeDevicesEmitter = new vscode.EventEmitter();
        this.onDidChangeDevices = this.onDidChangeDevicesEmitter.event;
        this.sdkManager = new AndroidSDKManager_1.AndroidSDKManager();
    }
    async refreshDevices() {
        try {
            const adbPath = this.sdkManager.getADBPath();
            const { stdout } = await execAsync(`"${adbPath}" devices -l`);
            this.devices = [];
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line && !line.startsWith('List of devices') && line.trim()) {
                    // مثال على السطر:
                    // 5cda021f               device usb:1-1 product:RMX2061 model:RMX2061 device:RMX2061L1
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const device = {
                            id: parts[0],
                            type: parts[0].startsWith('emulator-') ? 'emulator' : 'device',
                            state: parts[1]
                        };
                        // استخراج معلومات إضافية من باقي السطر
                        // البحث عن: model:xxx product:xxx device:xxx
                        const modelMatch = line.match(/model:([^\s]+)/);
                        const productMatch = line.match(/product:([^\s]+)/);
                        const deviceMatch = line.match(/device:([^\s]+)/);
                        if (modelMatch) {
                            device.model = modelMatch[1].replace(/_/g, ' '); // استبدال _ بمسافات
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
        }
        catch (error) {
            console.error('❌ Failed to refresh devices:', error);
            console.error('Error details:', error.message);
            this.devices = [];
            // إشعار المستخدم بالخطأ
            vscode.window.showErrorMessage(`❌ فشل تحديث الأجهزة: ${error.message}\n\n` +
                'الأسباب المحتملة:\n' +
                '• Android SDK غير مثبت أو غير مُكتشف\n' +
                '• ADB غير موجود في platform-tools\n' +
                '• الجهاز غير موصول أو USB Debugging غير مُفعّل');
        }
    }
    getDevices() {
        return this.devices;
    }
    getSelectedDevice() {
        return this.selectedDevice;
    }
    async selectDevice() {
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
    getDeviceDisplayName(device) {
        const icon = device.type === 'emulator' ? '📱' : '🔌';
        const status = device.state === 'online' || device.state === 'device' ? '🟢' : '🔴';
        // عرض اسم الجهاز الحقيقي (model أو product) بدلاً من ID
        const name = device.model || device.product || device.device || device.id;
        return `${status} ${icon} ${name}`;
    }
    async installApk(apkPath) {
        const device = this.selectedDevice;
        if (!device)
            throw new Error('No device selected');
        const adbPath = this.sdkManager.getADBPath();
        await execAsync(`"${adbPath}" -s ${device.id} install -r "${apkPath}"`);
    }
    async launchApp(packageName, activityName) {
        const device = this.selectedDevice;
        if (!device)
            throw new Error('No device selected');
        const adbPath = this.sdkManager.getADBPath();
        const fullActivity = `${packageName}/${activityName}`;
        await execAsync(`"${adbPath}" -s ${device.id} shell am start -n ${fullActivity}`);
    }
    async getPackageName(apkPath) {
        return 'com.example.app'; // مبسط للآن
    }
    dispose() {
        this.onDidChangeDevicesEmitter.dispose();
    }
}
exports.DeviceManager = DeviceManager;
//# sourceMappingURL=DeviceManager.js.map