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
exports.BuildSystem = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
/**
 * Manages Android build operations including building, running, and debugging.
 */
class BuildSystem {
    constructor(gradleService, deviceManager) {
        this.gradleService = gradleService;
        this.deviceManager = deviceManager;
    }
    /**
     * Build Debug APK
     */
    async buildDebug() {
        try {
            await this.gradleService.buildDebug();
            const apkPath = this.gradleService.getApkPath('debug');
            if (fs.existsSync(apkPath)) {
                const action = await vscode.window.showInformationMessage('✅ APK built successfully!', 'Install on device', 'Open folder');
                if (action === 'Install on device') {
                    await this.installAndRun(apkPath);
                }
                else if (action === 'Open folder') {
                    const path = require('path');
                    vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                }
            }
            else {
                vscode.window.showWarningMessage('⚠️ APK file not found');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Build failed: ${error.message}`);
        }
    }
    /**
     * Build Release APK
     */
    async buildRelease() {
        try {
            await this.gradleService.buildRelease();
            const apkPath = this.gradleService.getApkPath('release');
            if (fs.existsSync(apkPath)) {
                vscode.window.showInformationMessage('✅ Release APK built successfully!', 'Open folder').then(action => {
                    if (action === 'Open folder') {
                        const path = require('path');
                        vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                    }
                });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Build failed: ${error.message}`);
        }
    }
    /**
     * Clean project
     */
    async cleanProject() {
        try {
            await this.gradleService.clean();
            vscode.window.showInformationMessage('✅ Project cleaned successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Clean failed: ${error.message}`);
        }
    }
    /**
     * Run app on device
     */
    async runApp() {
        try {
            // Build APK first
            await this.gradleService.buildDebug();
            const apkPath = this.gradleService.getApkPath('debug');
            if (!fs.existsSync(apkPath)) {
                throw new Error('APK file not found');
            }
            // Install and run
            await this.installAndRun(apkPath);
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ Run failed: ${error.message}`);
        }
    }
    /**
     * Debug app on device
     */
    async debugApp() {
        vscode.window.showInformationMessage('🚧 Debug feature is under development...');
        // TODO: Implement Debug Adapter Protocol
    }
    /**
     * Install and run APK on device
     */
    async installAndRun(apkPath) {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        if (!selectedDevice) {
            const devices = this.deviceManager.getDevices();
            if (devices.length === 0) {
                vscode.window.showWarningMessage('⚠️ No devices connected!');
                return;
            }
            await this.deviceManager.selectDevice();
            return this.installAndRun(apkPath);
        }
        try {
            // Install APK
            await this.deviceManager.installApk(apkPath);
            // Get package name
            const packageName = await this.deviceManager.getPackageName(apkPath);
            // Launch app
            const activityName = '.MainActivity'; // Default
            await this.deviceManager.launchApp(packageName, activityName);
            vscode.window.showInformationMessage('✅ App launched successfully!');
        }
        catch (error) {
            throw new Error(`Failed to install and run: ${error.message}`);
        }
    }
}
exports.BuildSystem = BuildSystem;
//# sourceMappingURL=BuildSystem.js.map