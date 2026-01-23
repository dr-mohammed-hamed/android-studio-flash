import * as vscode from 'vscode';
import * as fs from 'fs';
import { GradleService } from '../core/GradleService';
import { DeviceManager } from '../devices/DeviceManager';

/**
 * Manages Android build operations including building, running, and debugging.
 */
export class BuildSystem {
    constructor(
        private gradleService: GradleService,
        private deviceManager: DeviceManager
    ) {}

    /**
     * Build Debug APK
     */
    async buildDebug(): Promise<void> {
        try {
            await this.gradleService.buildDebug();
            
            const apkPath = this.gradleService.getApkPath('debug');
            
            if (fs.existsSync(apkPath)) {
                const action = await vscode.window.showInformationMessage(
                    '✅ APK built successfully!',
                    'Install on device',
                    'Open folder'
                );

                if (action === 'Install on device') {
                    await this.installAndRun(apkPath);
                } else if (action === 'Open folder') {
                    const path = require('path');
                    vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                }
            } else {
                vscode.window.showWarningMessage('⚠️ APK file not found');
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Build failed: ${error.message}`);
        }
    }

    /**
     * Build Release APK
     */
    async buildRelease(): Promise<void> {
        try {
            await this.gradleService.buildRelease();
            
            const apkPath = this.gradleService.getApkPath('release');
            
            if (fs.existsSync(apkPath)) {
                vscode.window.showInformationMessage(
                    '✅ Release APK built successfully!',
                    'Open folder'
                ).then(action => {
                    if (action === 'Open folder') {
                        const path = require('path');
                        vscode.env.openExternal(vscode.Uri.file(path.dirname(apkPath)));
                    }
                });
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Build failed: ${error.message}`);
        }
    }

    /**
     * Clean project
     */
    async cleanProject(): Promise<void> {
        try {
            await this.gradleService.clean();
            vscode.window.showInformationMessage('✅ Project cleaned successfully!');
        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Clean failed: ${error.message}`);
        }
    }

    /**
     * Run app on device
     */
    async runApp(): Promise<void> {
        try {
            // Build APK first
            await this.gradleService.buildDebug();
            
            const apkPath = this.gradleService.getApkPath('debug');
            
            if (!fs.existsSync(apkPath)) {
                throw new Error('APK file not found');
            }

            // Install and run
            await this.installAndRun(apkPath);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Run failed: ${error.message}`);
        }
    }

    /**
     * Debug app on device
     */
    async debugApp(): Promise<void> {
        vscode.window.showInformationMessage('🚧 Debug feature is under development...');
        // TODO: Implement Debug Adapter Protocol
    }

    /**
     * Install and run APK on device
     */
    private async installAndRun(apkPath: string): Promise<void> {
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

        } catch (error: any) {
            throw new Error(`Failed to install and run: ${error.message}`);
        }
    }
}
