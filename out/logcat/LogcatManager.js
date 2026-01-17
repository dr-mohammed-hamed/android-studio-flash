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
exports.LogcatManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const AndroidSDKManager_1 = require("../core/AndroidSDKManager");
class LogcatManager {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this.logcatProcess = null;
        this.isRunning = false;
        this.outputChannel = vscode.window.createOutputChannel('Android Logcat');
        this.sdkManager = new AndroidSDKManager_1.AndroidSDKManager();
    }
    async showLogcat() {
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
            this.logcatProcess = (0, child_process_1.spawn)(adbPath, ['-s', selectedDevice.id, 'logcat', '-v', 'time']);
            this.isRunning = true;
            this.logcatProcess.stdout?.on('data', (data) => {
                this.outputChannel.appendLine(data.toString());
            });
            this.logcatProcess.on('close', () => {
                this.isRunning = false;
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل تشغيل Logcat: ${error.message}`);
        }
    }
    clearLogcat() {
        this.outputChannel.clear();
    }
    dispose() {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
        }
        this.outputChannel.dispose();
    }
}
exports.LogcatManager = LogcatManager;
//# sourceMappingURL=LogcatManager.js.map