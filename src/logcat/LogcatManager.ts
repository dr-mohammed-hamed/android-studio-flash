import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DeviceManager } from '../devices/DeviceManager';
import { AndroidSDKManager } from '../core/AndroidSDKManager';
import { PackageNameDetector } from '../utils/PackageNameDetector';

const execAsync = promisify(exec);

export type LogcatFilterMode = 'all' | 'app' | 'tag';

/**
 * Manages Android Logcat output with filtering and formatting capabilities.
 */
export class LogcatManager {
    private outputChannel: vscode.LogOutputChannel;
    private logcatProcess: ChildProcess | null = null;
    private sdkManager: AndroidSDKManager;
    private isRunning: boolean = false;
    private currentFilterMode: LogcatFilterMode = 'app';
    private currentPackageName: string = '';
    private currentTag: string = '';
    private useGrepFilter: boolean = false; // For code-level filtering if --pid doesn't work

    constructor(private deviceManager: DeviceManager) {
        // Use LogOutputChannel instead of OutputChannel for color support
        this.outputChannel = vscode.window.createOutputChannel('Android Logcat', { log: true });
        this.sdkManager = new AndroidSDKManager();
    }

    /**
     * Show Logcat with filtering
     */
    async showLogcat(filterMode?: LogcatFilterMode, packageName?: string, tag?: string): Promise<void> {
        const selectedDevice = this.deviceManager.getSelectedDevice();
        
        if (!selectedDevice) {
            vscode.window.showWarningMessage('⚠️ Please select a device first');
            return;
        }

        // Stop previous process if exists
        this.stopLogcat();

        // Set filter mode
        if (filterMode) {
            this.currentFilterMode = filterMode;
        }

        if (packageName) {
            this.currentPackageName = packageName;
        }

        if (tag) {
            this.currentTag = tag;
        }

        // If mode is "app" and no package name
        if (this.currentFilterMode === 'app' && !this.currentPackageName) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const projectRoot = workspaceFolder?.uri.fsPath;

            // Use smart detection system to get all sources
            const detectionResults = await PackageNameDetector.detectPackageNameSmart(
                this.sdkManager.getADBPath(),
                selectedDevice.id,
                projectRoot
            );

            if (detectionResults.length === 0) {
                vscode.window.showWarningMessage('⚠️ Package Name not found. Manual input required.');
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter application Package Name',
                    placeHolder: 'com.example.app'
                });
                
                if (!input) {
                    return;
                }
                
                this.currentPackageName = input;
            } else {
                // Show all results to user
                const selectedPackage = await PackageNameDetector.promptForPackageName(detectionResults);

                if (!selectedPackage) {
                    return; // User cancelled
                }

                this.currentPackageName = selectedPackage;
                
                // Show selected source
                const selected = detectionResults.find(r => r.packageName === selectedPackage);
                if (selected) {
                    const sourceNames = {
                        apk: 'Built APK',
                        foreground: 'Foreground App',
                        gradle: 'build.gradle',
                        manifest: 'AndroidManifest.xml',
                        device: 'Device'
                    };
                    console.log(`✅ Using package: ${selectedPackage} (from ${sourceNames[selected.source]})`);
                }
            }
        }

        // If mode is "tag" and no tag, ask user
        if (this.currentFilterMode === 'tag' && !this.currentTag) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter TAG to filter',
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

            // Build command based on filter mode (now async)
            this.useGrepFilter = false; // reset
            const logcatArgs = await this.buildLogcatArgs(selectedDevice.id);

            this.logcatProcess = spawn(adbPath, logcatArgs);
            this.isRunning = true;

            this.logcatProcess.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        // If using grep filter (app not running)
                        if (this.useGrepFilter && this.currentPackageName) {
                            // Filter lines containing package name
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
            vscode.window.showErrorMessage(`❌ Failed to start Logcat: ${error.message}`);
        }
    }

    /**
     * Build logcat arguments based on filter mode
     */
    private async buildLogcatArgs(deviceId: string): Promise<string[]> {
        const args = ['-s', deviceId, 'logcat', '-v', 'time'];

        switch (this.currentFilterMode) {
            case 'app':
                if (this.currentPackageName) {
                    try {
                        // Get PID from device
                        const adbPath = this.sdkManager.getADBPath();
                        
                        const { stdout } = await execAsync(
                            `"${adbPath}" -s ${deviceId} shell "pidof -s ${this.currentPackageName}"`
                        );
                        
                        const pid = stdout.trim();
                        
                        if (pid && pid !== '') {
                            console.log(`✅ Found PID for ${this.currentPackageName}: ${pid}`);
                            args.push('--pid', pid);
                        } else {
                            console.log(`⚠️ App ${this.currentPackageName} is not running. Showing all logs with grep filter instead.`);
                            // Alternative: use grep for filtering
                            // We'll use normal logcat and filter in code
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
                    // Filter by TAG
                    args.push('-s');
                    args.push(`${this.currentTag}:*`);
                }
                break;

            case 'all':
            default:
                // No filtering - all logs
                break;
        }

        return args;
    }

    /**
     * Get filter mode label
     */
    private getFilterModeLabel(): string {
        switch (this.currentFilterMode) {
            case 'all':
                return 'All Logs';
            case 'app':
                return `App Only: ${this.currentPackageName}`;
            case 'tag':
                return `Tag Filter: ${this.currentTag}`;
            default:
                return 'Unknown';
        }
    }

    /**
     * Toggle filter mode
     */
    async toggleFilterMode(): Promise<void> {
        const modes: { label: string; mode: LogcatFilterMode; description: string }[] = [
            {
                label: '$(package) App Only',
                mode: 'app',
                description: 'Show app logs only (like Android Studio)'
            },
            {
                label: '$(list-tree) All Logs',
                mode: 'all',
                description: 'Show all logs from device'
            },
            {
                label: '$(tag) Tag Filter',
                mode: 'tag',
                description: 'Filter by specific TAG'
            }
        ];

        const selected = await vscode.window.showQuickPick(modes, {
            placeHolder: 'Select filter mode'
        });

        if (selected) {
            this.currentFilterMode = selected.mode;
            
            // Restart Logcat with new mode
            if (this.isRunning) {
                await this.showLogcat();
            } else {
                vscode.window.showInformationMessage(`✅ Filter mode changed to: ${selected.label}`);
            }
        }
    }

    /**
     * Print line with appropriate log level
     */
    private logFormattedLine(line: string): void {
        const formattedLine = this.formatLogLine(line);
        
        // Determine level from line for correct log method usage
        if (line.includes(' E/') || line.includes('ERROR')) {
            this.outputChannel.error(formattedLine);
        } else if (line.includes(' W/') || line.includes('WARNING')) {
            this.outputChannel.warn(formattedLine);
        } else if (line.includes(' I/') || line.includes('INFO')) {
            this.outputChannel.info(formattedLine);
        } else {
            // DEBUG, VERBOSE, etc.
            this.outputChannel.trace(formattedLine);
        }
    }

    /**
     * Format log line with icons and highlighting
     */
    private formatLogLine(line: string): string {
        // Parse Logcat format
        // Format: 01-17 23:10:45.123 D/TagName(12345): Message
        const logLevelMatch = line.match(/(\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2}\.\d+)\s+([VDIWEF])\/([^(]+)\((\d+)\):\s+(.+)/);
        
        if (logLevelMatch) {
            const [, , time, level, tag, pid, message] = logLevelMatch;
            
            // Shorten time (remove extra milliseconds)
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
            
            // Highlight critical words in message
            const highlightedMessage = this.highlightCriticalWords(message);
            
            // Detect Stack Traces
            const isStackTrace = message.trim().startsWith('at ') || 
                                message.includes('Exception') ||
                                message.includes('Error:');
            
            const prefix = isStackTrace ? '  ↪ ' : '';
            
            // Enhanced formatting with clear separators
            const formattedLine = [
                shortTime,
                icon,
                levelName.padEnd(5),
                '│',
                tag.trim().padEnd(25), // Full TAG (25 chars)
                '│',
                `(${pid.padStart(5)})`,
                '│',
                prefix + highlightedMessage
            ].join(' ');
            
            return formattedLine;
        }
        
        // If we can't parse, return as-is
        return line;
    }

    /**
     * Highlight critical words in message
     */
    private highlightCriticalWords(message: string): string {
        // Critical words
        const criticalWords = [
            'crash', 'exception', 'error', 'fatal', 'killed',
            'nullpointer', 'outofmemory', 'stackoverflow',
            'failed', 'timeout', 'denied', 'forbidden'
        ];
        
        let highlighted = message;
        
        // Add ⚡ marker before critical words
        criticalWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            highlighted = highlighted.replace(regex, match => `⚡${match}⚡`);
        });
        
        return highlighted;
    }

    /**
     * Clear Logcat output
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
     * Stop Logcat
     */
    stopLogcat(): void {
        if (this.logcatProcess) {
            this.logcatProcess.kill();
            this.logcatProcess = null;
            this.isRunning = false;
        }
    }

    /**
     * Get current filter mode
     */
    getCurrentFilterMode(): LogcatFilterMode {
        return this.currentFilterMode;
    }

    dispose() {
        this.stopLogcat();
        this.outputChannel.dispose();
    }
}
