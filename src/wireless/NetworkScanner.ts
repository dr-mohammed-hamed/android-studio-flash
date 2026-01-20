import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export interface ScannedDevice {
    ip: string;
    port: number;
    name?: string;
}

export class NetworkScanner {
    constructor(private adbPath: string) {}

    /**
     * مسح الشبكة المحلية للبحث عن أجهزة Android
     */
    async scanNetwork(): Promise<ScannedDevice[]> {
        const localIp = this.getLocalIp();
        if (!localIp) {
            vscode.window.showErrorMessage('❌ لم نتمكن من تحديد IP المحلي');
            return [];
        }

        // استخراج Subnet (مثال: 192.168.1)
        const subnet = localIp.substring(0, localIp.lastIndexOf('.'));

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔍 جارِ مسح الشبكة...',
            cancellable: true
        }, async (progress, token) => {
            const devices: ScannedDevice[] = [];
            const port = 5555; // Default ADB port

            // مسح من .1 إلى .254 (مع تحسين السرعة)
            // سنختبر فقط عينة من العناوين للسرعة
            const ipsToTest: string[] = [];
            
            // اختبار أولاً العناوين الشائعة
            for (let i = 1; i <= 20; i++) {
                ipsToTest.push(`${subnet}.${i}`);
            }
            for (let i = 100; i <= 120; i++) {
                ipsToTest.push(`${subnet}.${i}`);
            }
            for (let i = 200; i <= 220; i++) {
                ipsToTest.push(`${subnet}.${i}`);
            }

            let tested = 0;
            for (const ip of ipsToTest) {
                if (token.isCancellationRequested) {
                    break;
                }

                tested++;
                progress.report({ 
                    message: `فحص ${ip}... (${tested}/${ipsToTest.length})`,
                    increment: (100 / ipsToTest.length)
                });

                // محاولة الاتصال (بدون timeout طويل)
                if (await this.testConnection(ip, port)) {
                    devices.push({ ip, port });
                }
            }

            return devices;
        });
    }

    /**
     * الحصول على IP المحلي
     */
    private getLocalIp(): string | null {
        const interfaces = os.networkInterfaces();
        
        for (const name of Object.keys(interfaces)) {
            const iface = interfaces[name];
            if (!iface) {
                continue;
            }

            for (const alias of iface) {
                // IPv4 وليس loopback
                if (alias.family === 'IPv4' && !alias.internal) {
                    return alias.address;
                }
            }
        }

        return null;
    }

    /**
     * اختبار اتصال بـ IP:Port
     */
    private async testConnection(ip: string, port: number): Promise<boolean> {
        try {
            const endpoint = `${ip}:${port}`;
            
            // محاولة اتصال سريعة مع timeout قصير
            const { stdout } = await execAsync(
                `"${this.adbPath}" connect ${endpoint}`,
                { timeout: 1500 } // 1.5 seconds timeout فقط
            );

            // إذا نجح الاتصال
            if (stdout.includes('connected')) {
                // قطع الاتصال فوراً (فقط للاختبار)
                try {
                    await execAsync(`"${this.adbPath}" disconnect ${endpoint}`, { timeout: 500 });
                } catch (e) {
                    // تجاهل أخطاء القطع
                }
                return true;
            }

            return false;

        } catch (error) {
            // فشل الاتصال = الجهاز غير موجود
            return false;
        }
    }
}
