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
exports.GradleService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Service for executing Gradle tasks and managing Android project builds.
 */
class GradleService {
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gradle');
    }
    /**
     * Get Gradle Wrapper path
     */
    getGradlewPath() {
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
    async executeGradleTask(task, showOutput = true) {
        try {
            const gradlew = this.getGradlewPath();
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
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
        }
        catch (error) {
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
    async buildDebug() {
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
    async buildRelease() {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '📦 Building Release APK...',
            cancellable: false
        }, async () => {
            return await this.executeGradleTask('assembleRelease');
        });
    }
    /**
     * Clean project
     */
    async clean() {
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
    async syncGradle() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 Syncing Gradle...',
            cancellable: false
        }, async () => {
            try {
                // Execute tasks to sync project
                await this.executeGradleTask('tasks', false);
                vscode.window.showInformationMessage('✅ Gradle sync completed!');
            }
            catch (error) {
                vscode.window.showErrorMessage(`❌ Gradle sync failed: ${error.message}`);
                throw error;
            }
        });
    }
    /**
     * Get built APK path
     */
    getApkPath(variant = 'debug') {
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const apkPath = path.join(workspaceFolder, 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`);
        return apkPath;
    }
    /**
     * Check if current workspace is an Android project
     */
    isAndroidProject() {
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
exports.GradleService = GradleService;
//# sourceMappingURL=GradleService.js.map