import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { DeviceManager } from '../devices/DeviceManager';
import { AndroidSDKManager } from '../core/AndroidSDKManager';
import { PackageNameDetector } from '../utils/PackageNameDetector';

export type LogcatFilterMode = 'all' | 'app' | 'tag';

export class LogcatManager {
    private outputChannel: vscode.LogOutputChannel;
    private logcatProcess: ChildProcess | null = null;
    private sdkManager: AndroidSDKManager;
    private isRunning: boolean = false;
    private currentFilterMode: LogcatFilterMode = 'app';
    private currentPackageName: string = '';
    private currentTag: string = '';
    private useGrepFilter: boolean = false; // للتصفية في الكود إذا لم يعمل --pid

    constructor(private deviceManager: DeviceManager) {
        // استخدام LogOutputChannel بدلاً من OutputChannel لدعم الألوان
        this.outputChannel = vscode.window.createOutputChannel('Android Logcat', { log: true });
        this.sdkManager = new AndroidSDKManager();
    }

    /**
     * عرض Logcat مع التصفية
     */
    async showLogcat(filterMode?: LogcatFilterMode, packageName?: string, tag?: string): Promise<void> {
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
            const detectionResults = await PackageNameDetector.detectPackageNameSmart(
                this.sdkManager.getADBPath(),
                selectedDevice.id,
                projectRoot
            );

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
            } else {
                // عرض جميع النتائج للمستخدم
                const selectedPackage = await PackageNameDetector.promptForPackageName(detectionResults);

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

            this.logcatProcess = spawn(adbPath, logcatArgs);
            this.isRunning = true;

            this.logcatProcess.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        // إذا كنا نستخدم grep filter (التطبيق غير شغال)
                        if (this.useGrepFilter && this.currentPackageName) {
                            // تصفية السطور التي تحتوي على package name
                            if (line.includes(this.currentPackageName)) {
                                this.logFormattedLine(line);
                            }
                        } else {
                            this.logFormattedLine(line);
                        }
                    }
                });
            });

            this.logcatProcess.on('close', () => {
                this.isRunning = false;
                this.outputChannel.appendLine('━'.repeat(80));
                this.outputChannel.appendLine('Logcat ended');
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل تشغيل Logcat: ${error.message}`);
        }
    }

    /**
     * بناء arguments للـ logcat حسب وضع التصفية
     */
    private async buildLogcatArgs(deviceId: string): Promise<string[]> {
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
                        
                        const { stdout } = await execAsync(
                            `"${adbPath}" -s ${deviceId} shell "pidof -s ${this.currentPackageName}"`
                        );
                        
                        const pid = stdout.trim();
                        
                        if (pid && pid !== '') {
                            console.log(`✅ Found PID for ${this.currentPackageName}: ${pid}`);
                            args.push('--pid', pid);
                        } else {
                            console.log(`⚠️ App ${this.currentPackageName} is not running. Showing all logs with grep filter instead.`);
                            // بديل: استخدام grep للتصفية
                            // سنستخدم logcat عادي ونصفي في الكود
                            this.useGrepFilter = true;
                        }
                    } catch (error) {
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
    private getFilterModeLabel(): string {
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
    async toggleFilterMode(): Promise<void> {
        const modes: { label: string; mode: LogcatFilterMode; description: string }[] = [
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
            } else {
                vscode.window.showInformationMessage(`✅ تم تغيير وضع التصفية إلى: ${selected.label}`);
            }
        }
    }

    /**
     * طباعة سطر مع المستوى المناسب
     */
    private logFormattedLine(line: string): void {
        const formattedLine = this.formatLogLine(line);
        
        // تحديد المستوى من السطر للاستخدام الصحيح للـ log methods
        if (line.includes(' E/') || line.includes('ERROR')) {
            this.outputChannel.error(formattedLine);
        } else if (line.includes(' W/') || line.includes('WARNING')) {
            this.outputChannel.warn(formattedLine);
        } else if (line.includes(' I/') || line.includes('INFO')) {
            this.outputChannel.info(formattedLine);
        } else {
            // DEBUG, VERBOSE, وغيرها
            this.outputChannel.trace(formattedLine);
        }
    }

    /**
     * تنسيق سطر السجل (احترافي مع highlighting للكلمات الهامة)
     */
    private formatLogLine(line: string): string {
        // تحليل نوع السجل من Logcat format
        // Format: 01-17 23:10:45.123 D/TagName(12345): Message
        const logLevelMatch = line.match(/(\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2}\.\d+)\s+([VDIWEF])\/([^(]+)\((\d+)\):\s+(.+)/);
        
        if (logLevelMatch) {
            const [, , time, level, tag, pid, message] = logLevelMatch;
            
            // اختصار الوقت (إزالة الميلي ثانية الزائدة)
            const shortTime = time.substring(0, 12); // HH:MM:SS.mmm
            
            let icon = '○';
            let levelName = '';
            
            switch (level) {
                case 'E': // Error
                    icon = '❌';
                    levelName = 'ERROR';
                    break;
                    
                case 'W': // Warning
                    icon = '⚠️';
                    levelName = 'WARN';
                    break;
                    
                case 'I': // Info
                    icon = 'ℹ️';
                    levelName = 'INFO';
                    break;
                    
                case 'D': // Debug
                    icon = '🔍';
                    levelName = 'DEBUG';
                    break;
                    
                case 'V': // Verbose
                    icon = '💬';
                    levelName = 'VERB';
                    break;
                    
                case 'F': // Fatal/Assert
                    icon = '💀';
                    levelName = 'FATAL';
                    break;
                    
                default:
                    return line;
            }
            
            // تحسين: Highlight الكلمات الحرجة في الرسالة
            const highlightedMessage = this.highlightCriticalWords(message);
            
            // تحسين: كشف Stack Traces
            const isStackTrace = message.trim().startsWith('at ') || 
                                message.includes('Exception') ||
                                message.includes('Error:');
            
            const prefix = isStackTrace ? '  ↪ ' : '';
            
            // تنسيق محسّن مع فواصل واضحة
            const formattedLine = [
                shortTime,
                icon,
                levelName.padEnd(5),
                '│',
                tag.trim().padEnd(25), // TAG كامل (25 حرف)
                '│',
                `(${pid.padStart(5)})`,
                '│',
                prefix + highlightedMessage
            ].join(' ');
            
            return formattedLine;
        }
        
        // إذا لم نستطع parse السطر، أرجعه كما هو
        return line;
    }

    /**
     * تحسين: Highlight الكلمات الحرجة
     */
    private highlightCriticalWords(message: string): string {
        // كلمات حرجة
        const criticalWords = [
            'crash', 'exception', 'error', 'fatal', 'killed',
            'nullpointer', 'outofmemory', 'stackoverflow',
            'failed', 'timeout', 'denied', 'forbidden'
        ];
        
        let highlighted = message;
        
        // إضافة علامة ⚡ قبل الكلمات الحرجة
        criticalWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            highlighted = highlighted.replace(regex, match => `⚡${match}⚡`);
        });
        
        return highlighted;
    }

    /**
     * مسح Logcat
     */
    clearLogcat(): void {
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
    stopLogcat(): void {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
            this.logcatProcess = null;
            this.isRunning = false;
        }
    }

    /**
     * الحصول على وضع التصفية الحالي
     */
    getCurrentFilterMode(): LogcatFilterMode {
        return this.currentFilterMode;
    }

    dispose() {
        this.stopLogcat();
        this.outputChannel.dispose();
    }
}
