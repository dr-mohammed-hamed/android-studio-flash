import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GradleService {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gradle');
    }

    /**
     * الحصول على مسار Gradle Wrapper
     */
    private getGradlewPath(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const isWindows = os.platform() === 'win32';
        const gradlewName = isWindows ? 'gradlew.bat' : 'gradlew';
        const gradlewPath = path.join(workspaceFolder.uri.fsPath, gradlewName);

        if (!fs.existsSync(gradlewPath)) {
            throw new Error('Gradle wrapper not found. Make sure you are in an Android project directory.');
        }

        return gradlewPath;
    }

    /**
     * تنفيذ أمر Gradle
     */
    async executeGradleTask(task: string, showOutput: boolean = true): Promise<string> {
        try {
            const gradlew = this.getGradlewPath();
            const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;

            if (showOutput) {
                this.outputChannel.show(true);
                this.outputChannel.appendLine(`🔨 Executing: ${task}`);
                this.outputChannel.appendLine('━'.repeat(50));
            }

            // تنفيذ الأمر
            const { stdout, stderr } = await execAsync(`"${gradlew}" ${task}`, {
                cwd: workspaceFolder,
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            if (showOutput) {
                if (stdout) {
                    this.outputChannel.appendLine(stdout);
                }
                if (stderr) {
                    this.outputChannel.appendLine('⚠️ Warnings:');
                    this.outputChannel.appendLine(stderr);
                }
                this.outputChannel.appendLine('━'.repeat(50));
                this.outputChannel.appendLine('✅ Task completed successfully!');
            }

            return stdout;

        } catch (error: any) {
            this.outputChannel.appendLine('━'.repeat(50));
            this.outputChannel.appendLine('❌ Task failed!');
            this.outputChannel.appendLine(error.message);
            if (error.stdout) {
                this.outputChannel.appendLine(error.stdout);
            }
            if (error.stderr) {
                this.outputChannel.appendLine(error.stderr);
            }
            throw error;
        }
    }

    /**
     * بناء Debug APK
     */
    async buildDebug(): Promise<string> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔨 Building Debug APK...',
            cancellable: false
        }, async () => {
            return await this.executeGradleTask('assembleDebug');
        });
    }

    /**
     * بناء Release APK
     */
    async buildRelease(): Promise<string> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '📦 Building Release APK...',
            cancellable: false
        }, async () => {
            return await this.executeGradleTask('assembleRelease');
        });
    }

    /**
     * تنظيف المشروع
     */
    async clean(): Promise<string> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🧹 Cleaning project...',
            cancellable: false
        }, async () => {
            return await this.executeGradleTask('clean');
        });
    }

    /**
     * مزامنة Gradle
     */
    async syncGradle(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 Syncing Gradle...',
            cancellable: false
        }, async () => {
            try {
                // تنفيذ tasks لمزامنة المشروع
                await this.executeGradleTask('tasks', false);
                vscode.window.showInformationMessage('✅ Gradle sync completed!');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Gradle sync failed: ${error.message}`);
                throw error;
            }
        });
    }

    /**
     * الحصول على مسار APK المبني
     */
    getApkPath(variant: 'debug' | 'release' = 'debug'): string {
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const apkPath = path.join(
            workspaceFolder,
            'app',
            'build',
            'outputs',
            'apk',
            variant,
            `app-${variant}.apk`
        );
        
        return apkPath;
    }

    /**
     * التحقق من وجود ملف build.gradle
     */
    isAndroidProject(): boolean {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const buildGradle = path.join(workspaceFolder.uri.fsPath, 'build.gradle');
        const buildGradleKts = path.join(workspaceFolder.uri.fsPath, 'build.gradle.kts');
        
        return fs.existsSync(buildGradle) || fs.existsSync(buildGradleKts);
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
