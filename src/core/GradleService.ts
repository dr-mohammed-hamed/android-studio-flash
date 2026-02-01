import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Service for executing Gradle tasks and managing Android project builds.
 */
export class GradleService {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gradle');
    }

    /**
     * Get Gradle Wrapper path
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
     * Execute a Gradle task
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

            // Execute command
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
     * Build Debug APK
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
     * Build Release APK
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
     * Build Release APK with signing parameters
     * Passes signing config via Gradle command line properties
     */
    async buildReleaseSigned(
        keystorePath: string,
        keyAlias: string,
        storePassword: string,
        keyPassword: string
    ): Promise<string> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '📦 Building Signed Release APK...',
            cancellable: false
        }, async () => {
            // Pass signing parameters via Gradle properties
            // These can be read in build.gradle using project.findProperty()
            const signingArgs = [
                `"-PANDROID_SIGNING_STORE_FILE=${keystorePath}"`,
                `"-PANDROID_SIGNING_KEY_ALIAS=${keyAlias}"`,
                `"-PANDROID_SIGNING_STORE_PASSWORD=${storePassword}"`,
                `"-PANDROID_SIGNING_KEY_PASSWORD=${keyPassword}"`
            ].join(' ');

            return await this.executeGradleTask(`assembleRelease ${signingArgs}`);
        });
    }

    /**
     * Clean project
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
     * Sync Gradle
     */
    async syncGradle(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 Syncing Gradle...',
            cancellable: false
        }, async () => {
            try {
                // Execute tasks to sync project
                await this.executeGradleTask('tasks', false);
                vscode.window.showInformationMessage('✅ Gradle sync completed!');
            } catch (error: any) {
                vscode.window.showErrorMessage(`❌ Gradle sync failed: ${error.message}`);
                throw error;
            }
        });
    }

    /**
     * Get built APK path
     * Searches for actual APK files in the output directory
     */
    getApkPath(variant: 'debug' | 'release' = 'debug'): string {
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const apkDir = path.join(
            workspaceFolder,
            'app',
            'build',
            'outputs',
            'apk',
            variant
        );

        // Default fallback path
        const defaultPath = path.join(apkDir, `app-${variant}.apk`);

        // Try to find actual APK file in the directory
        try {
            if (fs.existsSync(apkDir)) {
                const files = fs.readdirSync(apkDir);
                // Find any .apk file, prefer signed over unsigned
                const apkFiles = files.filter(f => f.endsWith('.apk'));
                
                if (apkFiles.length > 0) {
                    // Prefer files without "unsigned" in name
                    const signedApk = apkFiles.find(f => !f.includes('unsigned'));
                    const selectedApk = signedApk || apkFiles[0];
                    console.log(`✅ Found APK: ${selectedApk}`);
                    return path.join(apkDir, selectedApk);
                }
            }
        } catch (error) {
            console.warn('Error scanning APK directory:', error);
        }

        return defaultPath;
    }

    /**
     * Check if current workspace is an Android project
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
