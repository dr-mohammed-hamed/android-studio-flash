import * as vscode from 'vscode';
import { AndroidSDKManager } from '../core/AndroidSDKManager';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Diagnostic tool for testing ADB connection and devices.
 * Helps users troubleshoot common setup issues.
 */
export async function runDiagnostics(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Android Diagnostics');
    outputChannel.show();
    
    outputChannel.appendLine('🔍 Starting Android diagnostics...\n');
    outputChannel.appendLine('═'.repeat(60));
    
    // 1. Check SDK
    outputChannel.appendLine('\n📁 Checking Android SDK:');
    const sdkManager = new AndroidSDKManager();
    const sdkPath = sdkManager.getSDKPath();
    
    if (sdkPath) {
        outputChannel.appendLine(`✅ SDK Path: ${sdkPath}`);
    } else {
        outputChannel.appendLine('❌ Android SDK not detected!');
        outputChannel.appendLine('\nSolutions:');
        outputChannel.appendLine('1. Set path manually in Settings → android.sdkPath');
        outputChannel.appendLine('2. Or set ANDROID_HOME environment variable');
        return;
    }
    
    // 2. Check ADB
    outputChannel.appendLine('\n🔧 Checking ADB:');
    try {
        const adbPath = sdkManager.getADBPath();
        outputChannel.appendLine(`✅ ADB Path: ${adbPath}`);
        
        // Test ADB version
        const { stdout: versionOutput } = await execAsync(`"${adbPath}" version`);
        const versionMatch = versionOutput.match(/Android Debug Bridge version ([\d.]+)/);
        if (versionMatch) {
            outputChannel.appendLine(`✅ ADB Version: ${versionMatch[1]}`);
        }
        
    } catch (error: any) {
        outputChannel.appendLine(`❌ ADB Error: ${error.message}`);
        outputChannel.appendLine('\nSolutions:');
        outputChannel.appendLine('1. Open Android Studio → SDK Manager');
        outputChannel.appendLine('2. SDK Tools tab → Enable "Android SDK Platform-Tools"');
        return;
    }
    
    // 3. Check ADB Server
    outputChannel.appendLine('\n🖥️ Checking ADB Server:');
    try {
        const adbPath = sdkManager.getADBPath();
        
        // Restart Server
        outputChannel.appendLine('🔄 Restarting ADB Server...');
        await execAsync(`"${adbPath}" kill-server`);
        await execAsync(`"${adbPath}" start-server`);
        outputChannel.appendLine('✅ ADB Server is running');
        
    } catch (error: any) {
        outputChannel.appendLine(`⚠️ Server Warning: ${error.message}`);
    }
    
    // 4. Check connected devices
    outputChannel.appendLine('\n📱 Checking connected devices:');
    try {
        const adbPath = sdkManager.getADBPath();
        const { stdout } = await execAsync(`"${adbPath}" devices -l`);
        
        const lines = stdout.split('\n').filter(l => 
            l.trim() && !l.startsWith('List of devices')
        );
        
        if (lines.length === 0) {
            outputChannel.appendLine('❌ No devices connected!');
            outputChannel.appendLine('\nCheck:');
            outputChannel.appendLine('1. Device is connected with a data-capable USB cable');
            outputChannel.appendLine('2. USB Debugging is enabled on the device');
            outputChannel.appendLine('   Settings → Developer options → USB debugging');
            outputChannel.appendLine('3. You approved the "Allow USB debugging" prompt on device');
            outputChannel.appendLine('4. Try a different USB cable or port');
        } else {
            outputChannel.appendLine(`✅ Devices found: ${lines.length}\n`);
            
            lines.forEach((line, index) => {
                const parts = line.split(/\s+/);
                const deviceId = parts[0];
                const state = parts[1];
                
                outputChannel.appendLine(`Device ${index + 1}:`);
                outputChannel.appendLine(`  ID: ${deviceId}`);
                outputChannel.appendLine(`  State: ${state}`);
                
                // Extract additional info
                const modelMatch = line.match(/model:([^\s]+)/);
                const productMatch = line.match(/product:([^\s]+)/);
                
                if (modelMatch) {
                    outputChannel.appendLine(`  Model: ${modelMatch[1].replace(/_/g, ' ')}`);
                }
                if (productMatch) {
                    outputChannel.appendLine(`  Product: ${productMatch[1]}`);
                }
                
                // Warnings based on state
                if (state === 'unauthorized') {
                    outputChannel.appendLine('  ⚠️ Unauthorized! Approve USB debugging prompt on device');
                } else if (state === 'offline') {
                    outputChannel.appendLine('  ⚠️ Offline! Try: adb kill-server && adb start-server');
                } else if (state === 'device') {
                    outputChannel.appendLine('  ✅ Ready to use');
                }
                
                outputChannel.appendLine('');
            });
        }
        
    } catch (error: any) {
        outputChannel.appendLine(`❌ Failed to check devices: ${error.message}`);
    }
    
    // 5. Additional info
    outputChannel.appendLine('\n═'.repeat(60));
    outputChannel.appendLine('\n📚 Additional resources:');
    outputChannel.appendLine('• Troubleshooting guide: TROUBLESHOOTING.md');
    outputChannel.appendLine('• Wireless Debugging guide: WIRELESS_GUIDE.md');
    
    outputChannel.appendLine('\n✅ Diagnostics complete');
}
