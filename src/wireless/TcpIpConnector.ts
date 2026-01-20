import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { NetworkScanner, ScannedDevice } from './NetworkScanner';

const execAsync = promisify(exec);

export class TcpIpConnector {
    private scanner: NetworkScanner;

    constructor(private adbPath: string) {
        this.scanner = new NetworkScanner(adbPath);
    }

    /**
     * إعداد اتصال ADB over TCP/IP
     */
    async setupConnection(): Promise<void> {
        // عرض التعليمات
        const method = await vscode.window.showQuickPick([
            {
                label: '$(usb) جهاز متصل عبر USB',
                description: 'لديك جهاز موصول بكابل USB الآن',
                value: 'usb' as const
            },
            {
                label: '$(globe) جهاز على الشبكة',
                description: 'تم إعداد الجهاز مسبقاً',
                value: 'network' as const
            }
        ], {
            placeHolder: 'ما هي حالة الجهاز؟'
        });

        if (!method) {
            return;
        }

        if (method.value === 'usb') {
            await this.setupFromUsb();
        } else {
            await this.connectToExistingDevice();
        }
    }

    /**
     * إعداد من جهاز USB
     */
    private async setupFromUsb(): Promise<void> {
        try {
            // الخطوة 1: الحصول على قائمة الأجهزة المتصلة عبر USB
            const { stdout } = await execAsync(`"${this.adbPath}" devices`);
            const usbDevices = this.parseUsbDevices(stdout);

            if (usbDevices.length === 0) {
                vscode.window.showWarningMessage('⚠️ لا توجد أجهزة متصلة عبر USB');
                return;
            }

            // الخطوة 2: اختيار جهاز (إذا كان هناك أكثر من واحد)
            let selectedDeviceId: string;
            
            if (usbDevices.length === 1) {
                selectedDeviceId = usbDevices[0];
            } else {
                const selected = await vscode.window.showQuickPick(
                    usbDevices.map(id => ({ label: id, value: id })),
                    { placeHolder: 'اختر الجهاز' }
                );
                if (!selected) {
                    return;
                }
                selectedDeviceId = selected.value;
            }

            // الخطوة 3: تحويل الجهاز لوضع TCP/IP
            await this.enableTcpIpMode(selectedDeviceId);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ خطأ: ${error.message}`);
        }
    }

    /**
     * تحليل أجهزة USB
     */
    private parseUsbDevices(adbOutput: string): string[] {
        const lines = adbOutput.split('\n');
        const devices: string[] = [];

        for (const line of lines) {
            if (line && !line.startsWith('List of devices') && line.trim()) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[1] === 'device') {
                    // تجاهل الأجهزة اللاسلكية (التي تحتوي على :)
                    if (!parts[0].includes(':')) {
                        devices.push(parts[0]);
                    }
                }
            }
        }

        return devices;
    }

    /**
     * تفعيل وضع TCP/IP على الجهاز
     */
    private async enableTcpIpMode(deviceId: string, port: number = 5555): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔄 جارِ تفعيل TCP/IP mode...',
                cancellable: false
            }, async () => {
                // adb -s DEVICE tcpip PORT
                await execAsync(`"${this.adbPath}" -s ${deviceId} tcpip ${port}`);
            });

            // الخطوة 4: الحصول على IP الجهاز
            const deviceIp = await this.getDeviceIp(deviceId);

            if (!deviceIp) {
                vscode.window.showWarningMessage(
                    '⚠️ لم نتمكن من الحصول على IP الجهاز تلقائياً.\n' +
                    'يرجى إدخاله يدوياً.'
                );
                await this.connectToExistingDevice(port);
                return;
            }

            // ✨ التحسين: عرض IP الجهاز بوضوح قبل فصل الكابل
            const endpoint = `${deviceIp}:${port}`;
            
            const action = await vscode.window.showInformationMessage(
                `✅ تم تفعيل TCP/IP mode بنجاح!\n\n` +
                `📱 اسم الجهاز: ${deviceId}\n` +
                `🌐 عنوان الاتصال: ${endpoint}\n\n` +
                `الآن يمكنك فصل كابل USB والاتصال لاسلكياً.`,
                {
                    modal: true,
                    detail: 'سيتم الاتصال تلقائياً بعد تأكيدك.'
                },
                'اتصال الآن ✅',
                'نسخ IP 📋',
                'إلغاء'
            );

            if (action === 'نسخ IP 📋') {
                // نسخ IP للحافظة
                await vscode.env.clipboard.writeText(endpoint);
                vscode.window.showInformationMessage(`📋 تم نسخ: ${endpoint}`);
                
                // إعادة عرض الخيارات
                const retryAction = await vscode.window.showInformationMessage(
                    `تم نسخ الـ IP: ${endpoint}\n\nهل تريد الاتصال الآن؟`,
                    'اتصال الآن ✅',
                    'إلغاء'
                );
                
                if (retryAction === 'اتصال الآن ✅') {
                    await this.connectToDevice(deviceIp, port);
                }
            } else if (action === 'اتصال الآن ✅') {
                // الاتصال مباشرة
                await this.connectToDevice(deviceIp, port);
            }
            // إذا اختار "إلغاء" - لا نفعل شيء

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل تفعيل TCP/IP: ${error.message}`);
        }
    }

    /**
     * الحصول على IP الجهاز (مع إعادة محاولة)
     */
    private async getDeviceIp(deviceId: string, retries: number = 3): Promise<string | null> {
        // الانتظار قليلاً بعد تفعيل TCP/IP mode
        // الجهاز يحتاج وقت لإعادة تشغيل خدمة ADB
        await this.sleep(2000); // 2 ثانية
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // محاولة الحصول على IP عبر WiFi
                const { stdout } = await execAsync(
                    `"${this.adbPath}" -s ${deviceId} shell ip addr show wlan0`,
                    { timeout: 5000 } // timeout 5 ثواني
                );

                // البحث عن: inet 192.168.x.x/24
                const match = stdout.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
                if (match && match[1]) {
                    console.log(`✅ Got device IP on attempt ${attempt}: ${match[1]}`);
                    return match[1];
                }
                
            } catch (error: any) {
                console.log(`⚠️ Attempt ${attempt}/${retries} failed:`, error.message);
                
                if (attempt < retries) {
                    // انتظر قبل المحاولة التالية
                    await this.sleep(1500);
                }
            }
        }

        console.error('Failed to get device IP after all attempts');
        return null;
    }

    /**
     * دالة مساعدة للانتظار
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * الاتصال بجهاز موجود على الشبكة
     */
    private async connectToExistingDevice(defaultPort: number = 5555): Promise<void> {
        // خيار 1: إدخال يدوي
        // خيار 2: مسح الشبكة
        const method = await vscode.window.showQuickPick([
            {
                label: '$(edit) إدخال IP يدوياً',
                value: 'manual' as const
            },
            {
                label: '$(search) مسح الشبكة',
                description: 'البحث عن الأجهزة تلقائياً (قد يستغرق وقتاً)',
                value: 'scan' as const
            }
        ], {
            placeHolder: 'كيف تريد إيجاد الجهاز؟'
        });

        if (!method) {
            return;
        }

        if (method.value === 'manual') {
            await this.connectManually(defaultPort);
        } else {
            await this.scanAndConnect();
        }
    }

    /**
     * اتصال يدوي
     */
    private async connectManually(defaultPort: number): Promise<void> {
        const ipAddress = await vscode.window.showInputBox({
            prompt: 'أدخل IP Address للجهاز (يمكنك إيجاده في Settings → About → Status)',
            placeHolder: '192.168.1.100',
            validateInput: (value) => {
                const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                return regex.test(value) ? null : 'صيغة IP خاطئة';
            }
        });

        if (!ipAddress) {
            return;
        }

        await this.connectToDevice(ipAddress, defaultPort);
    }

    /**
     * مسح الشبكة
     */
    private async scanAndConnect(): Promise<void> {
        const foundDevices = await this.scanner.scanNetwork();

        if (foundDevices.length === 0) {
            vscode.window.showWarningMessage('⚠️ لم يتم إيجاد أي أجهزة');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            foundDevices.map((device: ScannedDevice) => ({
                label: device.name || device.ip,
                description: device.ip,
                deviceInfo: device
            })),
            { placeHolder: 'اختر جهازاً' }
        );

        if (!selected) {
            return;
        }

        await this.connectToDevice(selected.deviceInfo.ip, selected.deviceInfo.port);
    }

    /**
     * الاتصال بجهاز
     */
    private async connectToDevice(ip: string, port: number): Promise<void> {
        const endpoint = `${ip}:${port}`;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `🔄 جارِ الاتصال بـ ${endpoint}...`,
                cancellable: false
            }, async () => {
                await execAsync(`"${this.adbPath}" connect ${endpoint}`);
            });

            vscode.window.showInformationMessage(
                `✅ تم الاتصال بنجاح!\n${endpoint}\n\n` +
                'يمكنك الآن فصل كابل USB'
            );

            // تحديث قائمة الأجهزة
            vscode.commands.executeCommand('android.refreshDevices');

        } catch (error: any) {
            vscode.window.showErrorMessage(
                `❌ فشل الاتصال بـ ${endpoint}: ${error.message}\n\n` +
                'تأكد من:\n' +
                '• الجهاز والكمبيوتر على نفس الشبكة\n' +
                '• IP Address صحيح\n' +
                '• تم تفعيل Developer options على الجهاز'
            );
        }
    }
}
