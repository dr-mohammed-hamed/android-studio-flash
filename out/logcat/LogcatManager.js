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
const PackageNameDetector_1 = require("../utils/PackageNameDetector");
class LogcatManager {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this.logcatProcess = null;
        this.isRunning = false;
        this.currentFilterMode = 'app';
        this.currentPackageName = '';
        this.currentTag = '';
        this.useGrepFilter = false; // للتصفية في الكود إذا لم يعمل --pid
        this.outputChannel = vscode.window.createOutputChannel('Android Logcat');
        this.sdkManager = new AndroidSDKManager_1.AndroidSDKManager();
    }
    /**
     * عرض Logcat مع التصفية
     */
    async showLogcat(filterMode, packageName, tag) {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        if (!selectedDevice) {
            vscode.window.showWarningMessage('⚠️ يرجى اختيار جهاز أولاً');
            return;
        }
        // إيقاف العملية السابقة إن وجدت
        this.stopLogcat();
        // تحديد وضع التصفية
        if (filterMode) {
            this.currentFilterMode = filterMode;
        }
        if (packageName) {
            this.currentPackageName = packageName;
        }
        if (tag) {
            this.currentTag = tag;
        }
        // إذا كان الوضع "app" ولا يوجد package name
        if (this.currentFilterMode === 'app' && !this.currentPackageName) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const projectRoot = workspaceFolder?.uri.fsPath;
            // 🎯 استخدام النظام الذكي للحصول على جميع المصادر
            const detectionResults = await PackageNameDetector_1.PackageNameDetector.detectPackageNameSmart(this.sdkManager.getADBPath(), selectedDevice.id, projectRoot);
            if (detectionResults.length === 0) {
                vscode.window.showWarningMessage('⚠️ لم يتم العثور على Package Name. سيتم الطلب يدوياً.');
                const input = await vscode.window.showInputBox({
                    prompt: 'أدخل Package Name للتطبيق',
                    placeHolder: 'com.example.app'
                });
                if (!input) {
                    return;
                }
                this.currentPackageName = input;
            }
            else {
                // عرض جميع النتائج للمستخدم
                const selectedPackage = await PackageNameDetector_1.PackageNameDetector.promptForPackageName(detectionResults);
                if (!selectedPackage) {
                    return; // المستخدم ألغى
                }
                this.currentPackageName = selectedPackage;
                // عرض المصدر المختار
                const selected = detectionResults.find(r => r.packageName === selectedPackage);
                if (selected) {
                    const sourceNames = {
                        apk: 'APK المبني',
                        foreground: 'التطبيق الأمامي',
                        gradle: 'build.gradle',
                        manifest: 'AndroidManifest.xml',
                        device: 'الجهاز'
                    };
                    console.log(`✅ Using package: ${selectedPackage} (from ${sourceNames[selected.source]})`);
                }
            }
        }
        // إذا كان الوضع "tag" ولا يوجد tag، اسأل المستخدم
        if (this.currentFilterMode === 'tag' && !this.currentTag) {
            const input = await vscode.window.showInputBox({
                prompt: 'أدخل TAG للتصفية',
                placeHolder: 'MyApp'
            });
            if (!input) {
                return;
            }
            this.currentTag = input;
        }
        this.outputChannel.show(true);
        try {
            const adbPath = this.sdkManager.getADBPath();
            this.outputChannel.clear();
            this.outputChannel.appendLine('━'.repeat(80));
            this.outputChannel.appendLine(`📱 Device: ${selectedDevice.model || selectedDevice.id}`);
            this.outputChannel.appendLine(`🔍 Filter Mode: ${this.getFilterModeLabel()}`);
            this.outputChannel.appendLine('━'.repeat(80));
            // بناء الأمر حسب وضع التصفية (الآن async)
            this.useGrepFilter = false; // reset
            const logcatArgs = await this.buildLogcatArgs(selectedDevice.id);
            this.logcatProcess = (0, child_process_1.spawn)(adbPath, logcatArgs);
            this.isRunning = true;
            this.logcatProcess.stdout?.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        // إذا كنا نستخدم grep filter (التطبيق غير شغال)
                        if (this.useGrepFilter && this.currentPackageName) {
                            // تصفية السطور التي تحتوي على package name
                            if (line.includes(this.currentPackageName)) {
                                this.outputChannel.appendLine(this.formatLogLine(line));
                            }
                        }
                        else {
                            this.outputChannel.appendLine(this.formatLogLine(line));
                        }
                    }
                });
            });
            this.logcatProcess.on('close', () => {
                this.isRunning = false;
                this.outputChannel.appendLine('━'.repeat(80));
                this.outputChannel.appendLine('Logcat ended');
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`❌ فشل تشغيل Logcat: ${error.message}`);
        }
    }
    /**
     * بناء arguments للـ logcat حسب وضع التصفية
     */
    async buildLogcatArgs(deviceId) {
        const args = ['-s', deviceId, 'logcat', '-v', 'time'];
        switch (this.currentFilterMode) {
            case 'app':
                if (this.currentPackageName) {
                    try {
                        // الحصول على PID من الجهاز
                        const adbPath = this.sdkManager.getADBPath();
                        const { exec } = require('child_process');
                        const { promisify } = require('util');
                        const execAsync = promisify(exec);
                        const { stdout } = await execAsync(`"${adbPath}" -s ${deviceId} shell "pidof -s ${this.currentPackageName}"`);
                        const pid = stdout.trim();
                        if (pid && pid !== '') {
                            console.log(`✅ Found PID for ${this.currentPackageName}: ${pid}`);
                            args.push('--pid', pid);
                        }
                        else {
                            console.log(`⚠️ App ${this.currentPackageName} is not running. Showing all logs with grep filter instead.`);
                            // بديل: استخدام grep للتصفية
                            // سنستخدم logcat عادي ونصفي في الكود
                            this.useGrepFilter = true;
                        }
                    }
                    catch (error) {
                        console.log(`⚠️ Could not get PID. App may not be running. Will show all logs.`);
                        this.useGrepFilter = true;
                    }
                }
                break;
            case 'tag':
                if (this.currentTag) {
                    // تصفية حسب TAG
                    args.push('-s');
                    args.push(`${this.currentTag}:*`);
                }
                break;
            case 'all':
            default:
                // لا تصفية - كل السجلات
                break;
        }
        return args;
    }
    /**
     * الحصول على اسم وضع التصفية
     */
    getFilterModeLabel() {
        switch (this.currentFilterMode) {
            case 'all':
                return 'All Logs (جميع السجلات)';
            case 'app':
                return `App Only: ${this.currentPackageName}`;
            case 'tag':
                return `Tag Filter: ${this.currentTag}`;
            default:
                return 'Unknown';
        }
    }
    /**
     * تبديل وضع التصفية
     */
    async toggleFilterMode() {
        const modes = [
            {
                label: '$(package) App Only',
                mode: 'app',
                description: 'عرض سجلات التطبيق فقط (مثل Android Studio)'
            },
            {
                label: '$(list-tree) All Logs',
                mode: 'all',
                description: 'عرض جميع السجلات من الجهاز'
            },
            {
                label: '$(tag) Tag Filter',
                mode: 'tag',
                description: 'تصفية حسب TAG معين'
            }
        ];
        const selected = await vscode.window.showQuickPick(modes, {
            placeHolder: 'اختر وضع التصفية'
        });
        if (selected) {
            this.currentFilterMode = selected.mode;
            // إعادة تشغيل Logcat بالوضع الجديد
            if (this.isRunning) {
                await this.showLogcat();
            }
            else {
                vscode.window.showInformationMessage(`✅ تم تغيير وضع التصفية إلى: ${selected.label}`);
            }
        }
    }
    /**
     * تنسيق سطر السجل (إضافة ألوان حسب المستوى)
     */
    formatLogLine(line) {
        if (line.includes(' E ') || line.includes('ERROR')) {
            return `❌ ${line}`;
        }
        else if (line.includes(' W ') || line.includes('WARNING')) {
            return `⚠️  ${line}`;
        }
        else if (line.includes(' I ') || line.includes('INFO')) {
            return `ℹ️  ${line}`;
        }
        else if (line.includes(' D ') || line.includes('DEBUG')) {
            return `🔍 ${line}`;
        }
        else if (line.includes(' V ') || line.includes('VERBOSE')) {
            return `💬 ${line}`;
        }
        return line;
    }
    /**
     * مسح Logcat
     */
    clearLogcat() {
        this.outputChannel.clear();
        this.outputChannel.appendLine('🗑️ Logcat cleared');
        const selectedDevice = this.deviceManager.getSelectedDevice();
        if (selectedDevice && this.isRunning) {
            this.outputChannel.appendLine('━'.repeat(80));
            this.outputChannel.appendLine(`📱 Device: ${selectedDevice.model || selectedDevice.id}`);
            this.outputChannel.appendLine(`🔍 Filter Mode: ${this.getFilterModeLabel()}`);
            this.outputChannel.appendLine('━'.repeat(80));
        }
    }
    /**
     * إيقاف Logcat
     */
    stopLogcat() {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
            this.logcatProcess = null;
            this.isRunning = false;
        }
    }
    /**
     * الحصول على وضع التصفية الحالي
     */
    getCurrentFilterMode() {
        return this.currentFilterMode;
    }
    dispose() {
        this.stopLogcat();
        this.outputChannel.dispose();
    }
}
exports.LogcatManager = LogcatManager;
//# sourceMappingURL=LogcatManager.js.map