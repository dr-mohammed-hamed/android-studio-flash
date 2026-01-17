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
        // زر Run فقط
        this.runStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.setupStatusBarItems();
        this.update();
        this.show();
        // تحديث عند تغيير الأجهزة
        this.deviceManager.onDidChangeDevices(() => {
            this.update();
        });
    }
    setupStatusBarItems() {
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
        }
        else if (devices.length > 0) {
            this.runStatusBarItem.text = '$(warning) ▶️ Run (Select Device)';
        }
        else {
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
exports.BuildStatusBar = BuildStatusBar;
//# sourceMappingURL=BuildStatusBar.js.map