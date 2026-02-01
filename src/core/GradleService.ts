import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

import { AndroidSDKManager } from './AndroidSDKManager';

/**
 * Service for executing Gradle tasks and managing Android project builds.
 */
export class GradleService {
    private outputChannel: vscode.OutputChannel;
    private sdkManager: AndroidSDKManager;

    constructor(sdkManager: AndroidSDKManager) {
        this.outputChannel = vscode.window.createOutputChannel('Gradle');
        this.sdkManager = sdkManager;
    }

    /**
     * Get Gradle Wrapper path
     */
    /**
     * Find the Android project root directory.
     * Searches for settings.gradle or build.gradle in root and immediate subdirectories.
     */
    public findProjectRoot(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        
        const rootPath = workspaceFolder.uri.fsPath;

        // 1. Check if workspace root is the project root
        if (this.isProjectRoot(rootPath)) {
            return rootPath;
        }

        // 2. Check immediate subdirectories
        try {
            const subdirs = fs.readdirSync(rootPath)
                .map(name => path.join(rootPath, name))
                .filter(dir => fs.statSync(dir).isDirectory());

            for (const dir of subdirs) {
                if (this.isProjectRoot(dir)) {
                    return dir;
                }
            }
        } catch (error) {
            console.warn('Error scanning subdirectories:', error);
        }

        // Default to workspace root if no specific android project found
        // This allows the error to be handled downstream or standard behavior
        return rootPath;
    }

    /**
     * Check if a directory acts as a Gradle project root
     */
    private isProjectRoot(dirPath: string): boolean {
        // Check for settings.gradle (modern multi-module root)
        const hasSettings = fs.existsSync(path.join(dirPath, 'settings.gradle')) || 
                           fs.existsSync(path.join(dirPath, 'settings.gradle.kts'));
        
        // Check for build.gradle (single module or legacy)
        const hasBuild = fs.existsSync(path.join(dirPath, 'build.gradle')) || 
                        fs.existsSync(path.join(dirPath, 'build.gradle.kts'));

        // Check for Gradle wrapper presence (strong indicator)
        const hasWrapper = fs.existsSync(path.join(dirPath, 'gradlew')) || 
                          fs.existsSync(path.join(dirPath, 'gradlew.bat'));

        // A valid root should ideally have build configuration AND a wrapper, 
        // OR a settings file (which implies structure).
        // For Telegram/complex apps: settings.gradle is key.
        return (hasSettings || hasBuild) && hasWrapper;
    }

    /**
     * Get Gradle Wrapper path relative to project root
     */
    private getGradlewPath(projectRoot: string): string {
        const isWindows = os.platform() === 'win32';
        const wrapperBat = path.join(projectRoot, 'gradlew.bat');
        const wrapperShell = path.join(projectRoot, 'gradlew');

        // On Windows, prefer .bat, but allow shell script (Git Bash etc)
        if (isWindows) {
            if (fs.existsSync(wrapperBat)) {
                return wrapperBat;
            }
            if (fs.existsSync(wrapperShell)) {
                return wrapperShell;
            }
        } else {
            // Unix/Mac
            if (fs.existsSync(wrapperShell)) {
                return wrapperShell;
            }
        }

        throw new Error(`Gradle wrapper not found in ${projectRoot}. Make sure you are in an Android project directory.`);
    }

    private targetModule: string | null = null;

    /**
     * Set the target module for Gradle tasks
     * @param module The module name (e.g., ':app') or null for root
     */
    setTargetModule(module: string | null) {
        this.targetModule = (module === '(Project Root)') ? null : module;
    }

    /**
     * Get current target module
     */
    getTargetModule(): string | null {
        return this.targetModule;
    }

    /**
     * Execute a Gradle task
     */
    async executeGradleTask(task: string, showOutput: boolean = true): Promise<string> {
        try {
            const projectRoot = this.findProjectRoot();
            const gradlew = this.getGradlewPath(projectRoot);
            
            // Construct task with module prefix if selected
            let finalTask = task;
            if (this.targetModule && !task.startsWith(':') && !task.includes(' ')) {
                // Only prefix if task is simple (no spaces/args) and not already prefixed
                // This covers 'assembleDebug', 'clean', etc.
                finalTask = `${this.targetModule}:${task}`;
            }

            if (showOutput) {
                this.outputChannel.show(true);
                this.outputChannel.appendLine(`🔨 Executing: ${finalTask}`);
                if (this.targetModule) {
                     this.outputChannel.appendLine(`🎯 Target Module: ${this.targetModule}`);
                }
                this.outputChannel.appendLine(`📂 Project Root: ${projectRoot}`);
                this.outputChannel.appendLine('━'.repeat(50));
            }

            // Ensure local.properties exists with correct SDK path
            await this.ensureLocalProperties(projectRoot);

            // Execute command
            let command = `"${gradlew}" ${finalTask}`;

            // Fix for Windows: If using shell script (no .bat), run with bash
            if (os.platform() === 'win32' && !gradlew.endsWith('.bat')) {
                // If .bat is missing, we might be in a repo checked out on Windows but without .bat (rare but possible)
                // OR we are trying to run the shell script.
                // Running shell script with bash on Windows causes path issues (WSL /mnt/c vs C:\)
                // especially for local.properties which has Windows paths.
                
                // Better approach: Execute the JAR directly using Java
                // This keeps execution in Windows environment
                const jarPath = path.join(projectRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar');
                if (fs.existsSync(jarPath)) {
                    // Use -cp and explicit main class locally to avoid "no main manifest attribute" error
                    command = `java -Dorg.gradle.appname=gradlew -cp "${jarPath}" org.gradle.wrapper.GradleWrapperMain ${finalTask}`;
                    this.outputChannel.appendLine(`ℹ️  Running Gradle via Java specific Class (Windows compatibility mode)`);
                } else {
                    // Fallback to bash if JAR not found (legacy behavior)
                    await this.ensureUnixLineEndings(gradlew);
                    command = `bash "./gradlew" ${finalTask}`;
                }
            }

            const { stdout, stderr } = await execAsync(command, {
                cwd: projectRoot, // Important: Run from the submodule/project root
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME } // Ensure JAVA_HOME is passed
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
     * Searches recursively for APK files in the module's output directory.
     * Handles build flavors (e.g. build/outputs/apk/flavor/debug/app.apk).
     */
    getApkPath(variant: 'debug' | 'release' = 'debug'): string {
        const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
        
        // Determine module path from targetModule (e.g. :feature:login -> feature/login)
        // Default to 'app' if no module selected (standard Android convention)
        let modulePath = 'app';
        if (this.targetModule) {
            // Remove leading colon and replace others with platform separator
            modulePath = this.targetModule.replace(/^:/, '').replace(/:/g, path.sep);
        }

        const baseApkDir = path.join(
            workspaceFolder,
            modulePath,
            'build',
            'outputs',
            'apk'
        );

        this.outputChannel.appendLine(`🔍 Searching for APK in: ${baseApkDir}`);

        // Default fallback path
        const defaultPath = path.join(baseApkDir, variant, `app-${variant}.apk`);

        try {
            if (fs.existsSync(baseApkDir)) {
                // Recursive function to find all .apk files
                const findApks = (dir: string): string[] => {
                    let results: string[] = [];
                    const list = fs.readdirSync(dir);
                    list.forEach(file => {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        if (stat && stat.isDirectory()) {
                            results = results.concat(findApks(filePath));
                        } else if (file.endsWith('.apk')) {
                            results.push(filePath);
                        }
                    });
                    return results;
                };

                const allApks = findApks(baseApkDir);
                
                if (allApks.length > 0) {
                    // Filter and sort to find the best match
                    // 1. Must match the variant (debug/release) roughly
                    // 2. Should NOT be an androidTest
                    
                    const matches = allApks.filter(apk => {
                        const lowerPath = apk.toLowerCase();
                        const isAndroidTest = lowerPath.includes('androidtest');
                        const matchesVariant = lowerPath.includes(variant);
                        return matchesVariant && !isAndroidTest;
                    });

                    if (matches.length > 0) {
                        // Return the most recently modified one, or just the first one
                        // Let's sort by modification time (newest first)
                        matches.sort((a, b) => {
                            return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
                        });
                        
                        const selected = matches[0];
                        this.outputChannel.appendLine(`✅ Found APK: ${selected}`);
                        return selected;
                    }
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
        try {
            const projectRoot = this.findProjectRoot();
            return this.isProjectRoot(projectRoot);
        } catch (error) {
            return false;
        }
    }

    /**
     * Helper to ensure a file has Unix line endings (LF).
     * Necessary for running shell scripts on Windows.
     */
    private async ensureUnixLineEndings(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('\r\n')) {
                this.outputChannel.appendLine(`🔧 Fixing line endings for: ${path.basename(filePath)} (CRLF -> LF)`);
                const fixedContent = content.replace(/\r\n/g, '\n');
                fs.writeFileSync(filePath, fixedContent, 'utf8');
            }
        } catch (error) {
            console.warn(`Failed to fix line endings for ${filePath}:`, error);
        }
    }

    /**
     * Ensure local.properties exists with valid sdk.dir
     */
    private async ensureLocalProperties(projectRoot: string): Promise<void> {
        const localPropsPath = path.join(projectRoot, 'local.properties');
        
        try {
            const sdkPath = this.sdkManager.getSDKPath();
            if (!sdkPath) {
                this.outputChannel.appendLine('⚠️ Android SDK path not configured in extension. Skipping local.properties check.');
                return;
            }

            // escape backslashes for properties file (e.g. C:\Sdk -> C\:\\Sdk)
            const escapedSdkPath = sdkPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
            const sdkDirLine = `sdk.dir=${escapedSdkPath}`;

            if (fs.existsSync(localPropsPath)) {
                // File exists, check if sdk.dir is present
                let content = fs.readFileSync(localPropsPath, 'utf8');
                if (!content.includes('sdk.dir')) {
                    this.outputChannel.appendLine('🔧 Update local.properties: Adding sdk.dir');
                    // Add newline if needed
                    if (!content.endsWith('\n')) content += '\n';
                    content += `${sdkDirLine}\n`;
                    fs.writeFileSync(localPropsPath, content, 'utf8');
                } else {
                     // Parse to see if we need to update it? 
                     // For now, let's assume if it exists, the user might have set it. 
                     // But if the build failed previously, maybe we should force update/check?
                     // Let's just log it for now.
                     // this.outputChannel.appendLine('ℹ️  local.properties exists with sdk.dir');
                }
            } else {
                // File doesn't exist, create it
                this.outputChannel.appendLine('✨ Creating local.properties with SDK path');
                const content = `## This file is automatically generated by Android Studio Flash\n# Do not check into Version Control Systems.\n${sdkDirLine}\n`;
                fs.writeFileSync(localPropsPath, content, 'utf8');
            }

        } catch (error: any) {
            this.outputChannel.appendLine(`⚠️ Failed to update local.properties: ${error.message}`);
        }
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
