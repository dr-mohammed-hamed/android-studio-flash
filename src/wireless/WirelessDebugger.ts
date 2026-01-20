import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type PairingMethod = 'pairing-code' | 'qr-code';

export class WirelessDebugger {
    constructor(private adbPath: string) {}

    /**
     * اختيار طريقة Pairing
     */
    async promptPairingMethod(): Promise<PairingMethod | null> {
        const items = [
            {
                label: '$(key) Pairing Code',
                description: 'استخدام 6-digit code',
                detail: 'Settings → Developer options → Wireless debugging → Pair device with pairing code',
                method: 'pairing-code' as const
            },
            {
                label: '$(device-camera) QR Code',
                description: 'مسح QR Code (قريباً)',
                detail: 'Settings → Developer options → Wireless debugging → Pair device with QR code',
                method: 'qr-code' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'كيف تريد إقران الجهاز؟'
        });

        return selected?.method || null;
    }

    /**
     * Pairing باستخدام Code
     */
    async pairWithCode(): Promise<void> {
        // الخطوة 1: اطلب من المستخدم تفعيل Wireless Debugging
        const confirmed = await vscode.window.showInformationMessage(
            '📱 على الجهاز:\n' +
            '1. افتح Settings → Developer options → Wireless debugging\n' +
            '2. فعّل Wireless debugging\n' +
            '3. اضغط "Pair device with pairing code"\n' +
            '4. اترك الشاشة مفتوحة',
            'جاهز ✅',
            'إلغاء'
        );

        if (confirmed !== 'جاهز ✅') {
            return;
        }

        // الخطوة 2: اطلب IP و Port
        const ipPort = await vscode.window.showInputBox({
            prompt: 'أدخل IP Address:Port (مثال: 192.168.1.100:45678)',
            placeHolder: '192.168.1.100:45678',
            validateInput: (value) => {
                const regex = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
                return regex.test(value) ? null : 'صيغة خاطئة. استخدم: IP:PORT';
            }
        });

        if (!ipPort) {
            return;
        }

        // الخطوة 3: اطلب Pairing Code
        const pairingCode = await vscode.window.showInputBox({
            prompt: 'أدخل الـ Pairing Code المكون من 6 أرقام',
            placeHolder: '123456',
            validateInput: (value) => {
                return /^\d{6}$/.test(value) ? null : 'يجب أن يكون 6 أرقام';
            }
        });

        if (!pairingCode) {
            return;
        }

        // الخطوة 4: تنفيذ Pairing
        await this.executePairing(ipPort, pairingCode);
    }

    /**
     * تنفيذ عملية Pairing
     */
    private async executePairing(ipPort: string, pairingCode: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔄 جارِ الإقران...',
                cancellable: false
            }, async () => {
                // adb pair IP:PORT CODE
                const { stdout, stderr } = await execAsync(
                    `"${this.adbPath}" pair ${ipPort} ${pairingCode}`
                );

                console.log('Pairing output:', stdout);
                
                if (stderr && stderr.includes('failed')) {
                    throw new Error(stderr);
                }
            });

            // نجح الإقران - الآن نتصل
            await this.connectAfterPairing(ipPort.split(':')[0]);

        } catch (error: any) {
            vscode.window.showErrorMessage(
                `❌ فشل الإقران: ${error.message}\n\n` +
                'تأكد من:\n' +
                '• الجهاز والكمبيوتر على نفس الشبكة\n' +
                '• Pairing Code صحيح\n' +
                '• IP:Port صحيح'
            );
        }
    }

    /**
     * الاتصال بعد الإقران الناجح
     */
    private async connectAfterPairing(deviceIp: string): Promise<void> {
        // بعد الإقران، نحتاج للاتصال بالجهاز
        // عادة يكون على port مختلف (غالباً يظهر في "Wireless debugging" screen)
        
        const port = await vscode.window.showInputBox({
            prompt: 'على الجهاز، ارجع للشاشة الرئيسية لـ Wireless debugging\n' +
                    'أدخل رقم الـ Port المعروض تحت "Device name" (مثال: 37843)',
            placeHolder: '37843',
            validateInput: (value) => {
                return /^\d+$/.test(value) ? null : 'يجب أن يكون رقماً';
            }
        });

        if (!port) {
            return;
        }

        const endpoint = `${deviceIp}:${port}`;

        try {
            await execAsync(`"${this.adbPath}" connect ${endpoint}`);
            
            vscode.window.showInformationMessage(
                `✅ تم الاتصال بنجاح!\n${endpoint}\n\n` +
                'يمكنك الآن فصل كابل USB (إن كان موصولاً)'
            );

            // تحديث قائمة الأجهزة
            vscode.commands.executeCommand('android.refreshDevices');

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل الاتصال: ${error.message}`);
        }
    }
}
