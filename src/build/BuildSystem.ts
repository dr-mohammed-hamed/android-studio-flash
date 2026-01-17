import * as vscode from 'vscode';
import * as fs from 'fs';
import { GradleService } from '../core/GradleService';
import { DeviceManager } from '../devices/DeviceManager';

export class BuildSystem {
    constructor(
        private gradleService: GradleService,
        private deviceManager: DeviceManager
    ) {}

    /**
     * بناء Debug APK
     */
    async buildDebug(): Promise<void> {
        try {
            await this.gradleService.buildDebug();
            
            const apkPath = this.gradleService.getApkPath('debug');
            
            if (fs.existsSync(apkPath)) {
                const action = await vscode.window.showInformationMessage(
                    '✅ تم بناء APK بنجاح!',
                    'تثبيت على جهاز',
                    'فتح المجلد'
                );

                if (action === 'تثبيت على جهاز') {
                    await this.installAndRun(apkPath);
                } else if (action === 'فتح المجلد') {
                    const path = require('path');
                    vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                }
            } else {
                vscode.window.showWarningMessage('⚠️ لم يتم العثور على ملف APK');
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل البناء: ${error.message}`);
        }
    }

    /**
     * بناء Release APK
     */
    async buildRelease(): Promise<void> {
        try {
            await this.gradleService.buildRelease();
            
            const apkPath = this.gradleService.getApkPath('release');
            
            if (fs.existsSync(apkPath)) {
                vscode.window.showInformationMessage(
                    '✅ تم بناء Release APK بنجاح!',
                    'فتح المجلد'
                ).then(action => {
                    if (action === 'فتح المجلد') {
                        const path = require('path');
                        vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                    }
                });
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل البناء: ${error.message}`);
        }
    }

    /**
     * تنظيف المشروع
     */
    async cleanProject(): Promise<void> {
        try {
            await this.gradleService.clean();
            vscode.window.showInformationMessage('✅ تم تنظيف المشروع بنجاح!');
        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل التنظيف: ${error.message}`);
        }
    }

    /**
     * تشغيل التطبيق على جهاز
     */
    async runApp(): Promise<void> {
        try {
            // بناء APK أولاً
            await this.gradleService.buildDebug();
            
            const apkPath = this.gradleService.getApkPath('debug');
            
            if (!fs.existsSync(apkPath)) {
                throw new Error('APK file not found');
            }

            // تثبيت وتشغيل
            await this.installAndRun(apkPath);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل التشغيل: ${error.message}`);
        }
    }

    /**
     * تصحيح التطبيق على جهاز
     */
    async debugApp(): Promise<void> {
        vscode.window.showInformationMessage('🚧 ميزة التصحيح قيد التطوير...');
        // TODO: تنفيذ Debug Adapter Protocol
    }

    /**
     * تثبيت وتشغيل APK
     */
    private async installAndRun(apkPath: string): Promise<void> {
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

        } catch (error: any) {
            throw new Error(`Failed to install and run: ${error.message}`);
        }
    }
}
