import * as vscode from 'vscode';
import { AndroidSDKManager } from '../core/AndroidSDKManager';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * أداة تشخيص لاختبار اتصال ADB والأجهزة
 */
export async function runDiagnostics(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Android Diagnostics');
    outputChannel.show();
    
    outputChannel.appendLine('🔍 بدء تشخيص نظام Android...\n');
    outputChannel.appendLine('═'.repeat(60));
    
    // 1. فحص SDK
    outputChannel.appendLine('\n📁 فحص Android SDK:');
    const sdkManager = new AndroidSDKManager();
    const sdkPath = sdkManager.getSDKPath();
    
    if (sdkPath) {
        outputChannel.appendLine(`✅ SDK Path: ${sdkPath}`);
    } else {
        outputChannel.appendLine('❌ Android SDK غير مُكتشف!');
        outputChannel.appendLine('\nالحلول:');
        outputChannel.appendLine('1. حدد المسار يدويًا في Settings → android.sdkPath');
        outputChannel.appendLine('2. أو اضبط متغير البيئة ANDROID_HOME');
        return;
    }
    
    // 2. فحص ADB
    outputChannel.appendLine('\n🔧 فحص ADB:');
    try {
        const adbPath = sdkManager.getADBPath();
        outputChannel.appendLine(`✅ ADB Path: ${adbPath}`);
        
        // اختبار إصدار ADB
        const { stdout: versionOutput } = await execAsync(`"${adbPath}" version`);
        const versionMatch = versionOutput.match(/Android Debug Bridge version ([\d.]+)/);
        if (versionMatch) {
            outputChannel.appendLine(`✅ ADB Version: ${versionMatch[1]}`);
        }
        
    } catch (error: any) {
        outputChannel.appendLine(`❌ ADB Error: ${error.message}`);
        outputChannel.appendLine('\nالحلول:');
        outputChannel.appendLine('1. افتح Android Studio → SDK Manager');
        outputChannel.appendLine('2. تبويب SDK Tools → فعّل "Android SDK Platform-Tools"');
        return;
    }
    
    // 3. فحص ADB Server
    outputChannel.appendLine('\n🖥️ فحص ADB Server:');
    try {
        const adbPath = sdkManager.getADBPath();
        
        // إعادة تشغيل Server
        outputChannel.appendLine('🔄 إعادة تشغيل ADB Server...');
        await execAsync(`"${adbPath}" kill-server`);
        await execAsync(`"${adbPath}" start-server`);
        outputChannel.appendLine('✅ ADB Server يعمل');
        
    } catch (error: any) {
        outputChannel.appendLine(`⚠️ Server Warning: ${error.message}`);
    }
    
    // 4. فحص الأجهزة المتصلة
    outputChannel.appendLine('\n📱 فحص الأجهزة المتصلة:');
    try {
        const adbPath = sdkManager.getADBPath();
        const { stdout } = await execAsync(`"${adbPath}" devices -l`);
        
        const lines = stdout.split('\n').filter(l => 
            l.trim() && !l.startsWith('List of devices')
        );
        
        if (lines.length === 0) {
            outputChannel.appendLine('❌ لا توجد أجهزة متصلة!');
            outputChannel.appendLine('\nتحقق من:');
            outputChannel.appendLine('1. الجهاز موصول بكابل USB يدعم نقل البيانات');
            outputChannel.appendLine('2. USB Debugging مُفعّل على الجهاز');
            outputChannel.appendLine('   Settings → Developer options → USB debugging');
            outputChannel.appendLine('3. وافقت على رسالة "Allow USB debugging" على الجهاز');
            outputChannel.appendLine('4. جرّب كابل USB آخر أو منفذ USB آخر');
        } else {
            outputChannel.appendLine(`✅ عدد الأجهزة: ${lines.length}\n`);
            
            lines.forEach((line, index) => {
                const parts = line.split(/\s+/);
                const deviceId = parts[0];
                const state = parts[1];
                
                outputChannel.appendLine(`جهاز ${index + 1}:`);
                outputChannel.appendLine(`  ID: ${deviceId}`);
                outputChannel.appendLine(`  State: ${state}`);
                
                // استخراج المعلومات الإضافية
                const modelMatch = line.match(/model:([^\s]+)/);
                const productMatch = line.match(/product:([^\s]+)/);
                
                if (modelMatch) {
                    outputChannel.appendLine(`  Model: ${modelMatch[1].replace(/_/g, ' ')}`);
                }
                if (productMatch) {
                    outputChannel.appendLine(`  Product: ${productMatch[1]}`);
                }
                
                // تحذيرات حسب الحالة
                if (state === 'unauthorized') {
                    outputChannel.appendLine('  ⚠️ غير مُصرّح! وافق على رسالة USB debugging على الجهاز');
                } else if (state === 'offline') {
                    outputChannel.appendLine('  ⚠️ غير متصل! جرّب: adb kill-server && adb start-server');
                } else if (state === 'device') {
                    outputChannel.appendLine('  ✅ جاهز للاستخدام');
                }
                
                outputChannel.appendLine('');
            });
        }
        
    } catch (error: any) {
        outputChannel.appendLine(`❌ فشل فحص الأجهزة: ${error.message}`);
    }
    
    // 5. معلومات إضافية
    outputChannel.appendLine('\n═'.repeat(60));
    outputChannel.appendLine('\n📚 موارد إضافية:');
    outputChannel.appendLine('• دليل Troubleshooting: TROUBLESHOOTING.md');
    outputChannel.appendLine('• دليل Wireless Debugging: WIRELESS_GUIDE.md');
    
    outputChannel.appendLine('\n✅ انتهى التشخيص');
}
