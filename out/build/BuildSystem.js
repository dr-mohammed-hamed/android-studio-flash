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
class BuildSystem {
    constructor(gradleService, deviceManager) {
        this.gradleService = gradleService;
        this.deviceManager = deviceManager;
    }
    /**
     * بناء Debug APK
     */
    async buildDebug() {
        try {
            await this.gradleService.buildDebug();
            const apkPath = this.gradleService.getApkPath('debug');
            if (fs.existsSync(apkPath)) {
                const action = await vscode.window.showInformationMessage('✅ تم بناء APK بنجاح!', 'تثبيت على جهاز', 'فتح المجلد');
                if (action === 'تثبيت على جهاز') {
                    await this.installAndRun(apkPath);
                }
                else if (action === 'فتح المجلد') {
                    const path = require('path');
                    vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                }
            }
            else {
                vscode.window.showWarningMessage('⚠️ لم يتم العثور على ملف APK');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل البناء: ${error.message}`);
        }
    }
    /**
     * بناء Release APK
     */
    async buildRelease() {
        try {
            await this.gradleService.buildRelease();
            const apkPath = this.gradleService.getApkPath('release');
            if (fs.existsSync(apkPath)) {
                vscode.window.showInformationMessage('✅ تم بناء Release APK بنجاح!', 'فتح المجلد').then(action => {
                    if (action === 'فتح المجلد') {
                        const path = require('path');
                        vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                    }
                });
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل البناء: ${error.message}`);
        }
    }
    /**
     * تنظيف المشروع
     */
    async cleanProject() {
        try {
            await this.gradleService.clean();
            vscode.window.showInformationMessage('✅ تم تنظيف المشروع بنجاح!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل التنظيف: ${error.message}`);
        }
    }
    /**
     * تشغيل التطبيق على جهاز
     */
    async runApp() {
        try {
            // بناء APK أولاً
            await this.gradleService.buildDebug();
            const apkPath = this.gradleService.getApkPath('debug');
            if (!fs.existsSync(apkPath)) {
                throw new Error('APK file not found');
            }
            // تثبيت وتشغيل
            await this.installAndRun(apkPath);
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل التشغيل: ${error.message}`);
        }
    }
    /**
     * تصحيح التطبيق على جهاز
     */
    async debugApp() {
        vscode.window.showInformationMessage('🚧 ميزة التصحيح قيد التطوير...');
        // TODO: تنفيذ Debug Adapter Protocol
    }
    /**
     * تثبيت وتشغيل APK
     */
    async installAndRun(apkPath) {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        if (!selectedDevice) {
            const devices = this.deviceManager.getDevices();
            if (devices.length === 0) {
                vscode.window.showWarningMessage('⚠️ لا توجد أجهزة متصلة!');
                return;
            }
            await this.deviceManager.selectDevice();
            return this.installAndRun(apkPath);
        }
        try {
            // تثبيت APK
            await this.deviceManager.installApk(apkPath);
            // الحصول على package name
            const packageName = await this.deviceManager.getPackageName(apkPath);
            // تشغيل التطبيق
            const activityName = '.MainActivity'; // افتراضي
            await this.deviceManager.launchApp(packageName, activityName);
            vscode.window.showInformationMessage('✅ تم تشغيل التطبيق بنجاح!');
        }
        catch (error) {
            throw new Error(`Failed to install and run: ${error.message}`);
        }
    }
}
exports.BuildSystem = BuildSystem;
//# sourceMappingURL=BuildSystem.js.map