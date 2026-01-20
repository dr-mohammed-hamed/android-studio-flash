import * as vscode from 'vscode';
import { WirelessDebugger } from './WirelessDebugger';
import { TcpIpConnector } from './TcpIpConnector';
import { AndroidDevice } from '../devices/DeviceManager';

export interface WirelessDevice extends AndroidDevice {
    connectionType: 'wireless-debug' | 'tcpip';
    ipAddress: string;
    port: number;
    paired?: boolean;
}

export class WirelessADBManager {
    private wirelessDebugger: WirelessDebugger;
    private tcpIpConnector: TcpIpConnector;
    private wirelessDevices: WirelessDevice[] = [];
    private onDidChangeDevicesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeDevices = this.onDidChangeDevicesEmitter.event;

    constructor(private adbPath: string) {
        this.wirelessDebugger = new WirelessDebugger(adbPath);
        this.tcpIpConnector = new TcpIpConnector(adbPath);
    }

    /**
     * فتح واجهة إعداد التوصيل اللاسلكي
     */
    async setupWirelessConnection(): Promise<void> {
        // عرض Quick Pick لاختيار الطريقة
        const method = await this.promptConnectionMethod();
        
        if (!method) {
            return;
        }

        switch (method) {
            case 'wireless-debug':
                await this.setupWirelessDebugging();
                break;
            case 'tcpip':
                await this.setupTcpIp();
                break;
        }
    }

    /**
     * اختيار طريقة التوصيل
     */
    private async promptConnectionMethod(): Promise<'wireless-debug' | 'tcpip' | null> {
        const items = [
            {
                label: '$(radio-tower) Wireless Debugging',
                description: 'Android 11+ - الأسهل',
                detail: 'استخدام QR Code أو Pairing Code',
                method: 'wireless-debug' as const
            },
            {
                label: '$(plug) ADB over TCP/IP',
                description: 'Android 4.0+ - يحتاج USB لمرة واحدة',
                detail: 'للأجهزة القديمة',
                method: 'tcpip' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'اختر طريقة التوصيل اللاسلكي'
        });

        return selected?.method || null;
    }

    /**
     * إعداد Wireless Debugging (Android 11+)
     */
    private async setupWirelessDebugging(): Promise<void> {
        const pairingMethod = await this.wirelessDebugger.promptPairingMethod();
        
        if (!pairingMethod) {
            return;
        }

        if (pairingMethod === 'pairing-code') {
            await this.wirelessDebugger.pairWithCode();
        } else {
            vscode.window.showInformationMessage(
                '⚠️ QR Code pairing سيتم إضافته قريباً. استخدم Pairing Code حالياً.'
            );
        }

        // تحديث قائمة الأجهزة
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * إعداد ADB over TCP/IP
     */
    private async setupTcpIp(): Promise<void> {
        await this.tcpIpConnector.setupConnection();
        
        // تحديث قائمة الأجهزة
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * قطع اتصال جهاز لاسلكي
     */
    async disconnectDevice(device: WirelessDevice): Promise<void> {
        const endpoint = `${device.ipAddress}:${device.port}`;
        
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            await execAsync(`"${this.adbPath}" disconnect ${endpoint}`);
            
            // إزالة من القائمة
            this.wirelessDevices = this.wirelessDevices.filter(d => d.id !== device.id);
            
            vscode.window.showInformationMessage(`✅ تم قطع الاتصال: ${device.model || endpoint}`);
            this.onDidChangeDevicesEmitter.fire();
        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ فشل قطع الاتصال: ${error.message}`);
        }
    }

    /**
     * الحصول على الأجهزة اللاسلكية المتصلة
     */
    getWirelessDevices(): WirelessDevice[] {
        return this.wirelessDevices;
    }

    /**
     * تحديث قائمة الأجهزة اللاسلكية
     */
    async refreshWirelessDevices(): Promise<void> {
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync(`"${this.adbPath}" devices -l`);
            const lines = stdout.split('\n');
            
            this.wirelessDevices = [];
            
            for (const line of lines) {
                if (line && !line.startsWith('List of devices') && line.trim()) {
                    // البحث عن أجهزة لاسلكية (تحتوي على :)
                    if (line.includes(':')) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 2) {
                            const endpoint = parts[0];
                            const [ip, port] = endpoint.split(':');
                            
                            // استخراج معلومات إضافية
                            const modelMatch = line.match(/model:([^\s]+)/);
                            const productMatch = line.match(/product:([^\s]+)/);
                            const deviceMatch = line.match(/device:([^\s]+)/);
                            
                            const device: WirelessDevice = {
                                id: endpoint,
                                type: 'device',
                                state: parts[1] as any,
                                connectionType: 'tcpip', // سنحدده لاحقاً
                                ipAddress: ip,
                                port: parseInt(port),
                                model: modelMatch ? modelMatch[1].replace(/_/g, ' ') : undefined,
                                product: productMatch ? productMatch[1] : undefined,
                                device: deviceMatch ? deviceMatch[1] : undefined
                            };
                            
                            this.wirelessDevices.push(device);
                        }
                    }
                }
            }
            
            this.onDidChangeDevicesEmitter.fire();
        } catch (error) {
            console.error('Failed to refresh wireless devices:', error);
        }
    }

    dispose() {
        this.onDidChangeDevicesEmitter.dispose();
    }
}
