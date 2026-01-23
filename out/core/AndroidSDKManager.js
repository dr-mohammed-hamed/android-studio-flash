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
exports.AndroidSDKManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
/**
 * Manages Android SDK detection and path resolution.
 * Automatically detects SDK location from settings, environment variables, or default paths.
 */
class AndroidSDKManager {
    constructor() {
        this.sdkPath = '';
        this.detectSDK();
    }
    /**
     * Automatically detect Android SDK path
     */
    detectSDK() {
        // First, try to get from settings
        const config = vscode.workspace.getConfiguration('android');
        const configuredPath = config.get('sdkPath');
        if (configuredPath && fs.existsSync(configuredPath)) {
            this.sdkPath = configuredPath;
            console.log('✅ SDK found from settings:', this.sdkPath);
            return;
        }
        // Try to get from environment variables
        const envPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (envPath && fs.existsSync(envPath)) {
            this.sdkPath = envPath;
            console.log('✅ SDK found from environment:', this.sdkPath);
            return;
        }
        // Default paths based on operating system
        const defaultPaths = this.getDefaultSDKPaths();
        for (const defaultPath of defaultPaths) {
            if (fs.existsSync(defaultPath)) {
                this.sdkPath = defaultPath;
                console.log('✅ SDK found at default location:', this.sdkPath);
                return;
            }
        }
        console.warn('⚠️ Android SDK not found automatically');
    }
    /**
     * Get default SDK paths based on operating system
     */
    getDefaultSDKPaths() {
        const homeDir = os.homedir();
        const platform = os.platform();
        if (platform === 'win32') {
            return [
                path.join(homeDir, 'AppData', 'Local', 'Android', 'Sdk'),
                'C:\\Android\\sdk',
                'C:\\Program Files\\Android\\Sdk',
                'C:\\Program Files (x86)\\Android\\Sdk'
            ];
        }
        else if (platform === 'darwin') {
            return [
                path.join(homeDir, 'Library', 'Android', 'sdk')
            ];
        }
        else {
            return [
                path.join(homeDir, 'Android', 'Sdk'),
                '/usr/local/android-sdk'
            ];
        }
    }
    /**
     * Get SDK path
     */
    getSDKPath() {
        return this.sdkPath;
    }
    /**
     * Get ADB executable path
     */
    getADBPath() {
        if (!this.sdkPath) {
            throw new Error('Android SDK not found');
        }
        const adbName = os.platform() === 'win32' ? 'adb.exe' : 'adb';
        const adbPath = path.join(this.sdkPath, 'platform-tools', adbName);
        if (!fs.existsSync(adbPath)) {
            throw new Error('ADB not found at: ' + adbPath);
        }
        return adbPath;
    }
    /**
     * Get AVD Manager path
     */
    getAVDManagerPath() {
        if (!this.sdkPath) {
            throw new Error('Android SDK not found');
        }
        const scriptExt = os.platform() === 'win32' ? '.bat' : '';
        const avdManagerPath = path.join(this.sdkPath, 'cmdline-tools', 'latest', 'bin', `avdmanager${scriptExt}`);
        return avdManagerPath;
    }
    /**
     * Get Emulator executable path
     */
    getEmulatorPath() {
        if (!this.sdkPath) {
            throw new Error('Android SDK not found');
        }
        const emulatorName = os.platform() === 'win32' ? 'emulator.exe' : 'emulator';
        const emulatorPath = path.join(this.sdkPath, 'emulator', emulatorName);
        return emulatorPath;
    }
    /**
     * Verify SDK is properly installed
     */
    async verifySDK() {
        if (!this.sdkPath) {
            vscode.window.showErrorMessage('❌ Android SDK not found. Please set the path in Settings.');
            return false;
        }
        try {
            this.getADBPath(); // Will throw if not found
            return true;
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ ${error}`);
            return false;
        }
    }
    /**
     * Prompt user to select SDK path
     */
    async promptForSDKPath() {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Android SDK folder'
        });
        if (uri && uri[0]) {
            const selectedPath = uri[0].fsPath;
            const config = vscode.workspace.getConfiguration('android');
            await config.update('sdkPath', selectedPath, vscode.ConfigurationTarget.Global);
            this.sdkPath = selectedPath;
            vscode.window.showInformationMessage('✅ SDK path updated successfully!');
        }
    }
}
exports.AndroidSDKManager = AndroidSDKManager;
//# sourceMappingURL=AndroidSDKManager.js.map