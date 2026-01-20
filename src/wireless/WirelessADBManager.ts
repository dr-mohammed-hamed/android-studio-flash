import * as vscode from 'vscode';
import { WirelessDebugger } from './WirelessDebugger';
import { TcpIpConnector } from './TcpIpConnector';
import { AndroidDevice } from '../devices/DeviceManager';

export interface WirelessDevice extends AndroidDevice {
    connectionType: 'wireless-debug' | 'tcpip';
    ipAddress: string;
    port: number;
    paired?: boolean;
    lastConnected?: number; // timestamp
}

interface SavedWirelessDevice {
    id: string;
    ipAddress: string;
    port: number;
    connectionType: 'wireless-debug' | 'tcpip';
    model?: string;
    lastConnected: number;
}

export class WirelessADBManager {
    private wirelessDebugger: WirelessDebugger;
    private tcpIpConnector: TcpIpConnector;
    private wirelessDevices: WirelessDevice[] = [];
    private onDidChangeDevicesEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeDevices = this.onDidChangeDevicesEmitter.event;
    private readonly STORAGE_KEY = 'android.wirelessDevices';

    constructor(
        private adbPath: string,
        private context: vscode.ExtensionContext
    ) {
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
     * ═══════════════════════════════════════════════════════
     *  PERSISTENCE SYSTEM
     * ═══════════════════════════════════════════════════════
     */

    /**
     * حفظ جميع الأجهزة اللاسلكية الحالية
     */
    private async saveWirelessDevices(): Promise<void> {
        try {
            const savedDevices: SavedWirelessDevice[] = this.wirelessDevices.map(device => ({
                id: device.id,
                ipAddress: device.ipAddress,
                port: device.port,
                connectionType: device.connectionType,
                model: device.model,
                lastConnected: Date.now()
            }));

            await this.context.globalState.update(this.STORAGE_KEY, savedDevices);
            console.log(`💾 Saved ${savedDevices.length} wireless devices`);
        } catch (error) {
            console.error('Failed to save wireless devices:', error);
        }
    }

    /**
     * تحميل الأجهزة المحفوظة
     */
    private async loadWirelessDevices(): Promise<SavedWirelessDevice[]> {
        try {
            const saved = this.context.globalState.get<SavedWirelessDevice[]>(this.STORAGE_KEY, []);
            console.log(`📂 Loaded ${saved.length} saved wireless devices`);
            return saved;
        } catch (error) {
            console.error('Failed to load wireless devices:', error);
            return [];
        }
    }

    /**
     * إضافة جهاز للقائمة المحفوظة
     */
    async addSavedDevice(device: WirelessDevice): Promise<void> {
        try {
            const saved = await this.loadWirelessDevices();
            
            // حذف النسخة القديمة إن وجدت
            const filtered = saved.filter(d => d.id !== device.id);
            
            // إضافة الجهاز الجديد
            filtered.push({
                id: device.id,
                ipAddress: device.ipAddress,
                port: device.port,
                connectionType: device.connectionType,
                model: device.model,
                lastConnected: Date.now()
            });

            await this.context.globalState.update(this.STORAGE_KEY, filtered);
            console.log(`✅ Added device to saved list: ${device.id}`);
        } catch (error) {
            console.error('Failed to add saved device:', error);
        }
    }

    /**
     * حذف جهاز من القائمة المحفوظة
     */
    async removeSavedDevice(deviceId: string): Promise<void> {
        try {
            const saved = await this.loadWirelessDevices();
            const filtered = saved.filter(d => d.id !== deviceId);
            await this.context.globalState.update(this.STORAGE_KEY, filtered);
            console.log(`🗑️ Removed device from saved list: ${deviceId}`);
            
            vscode.window.showInformationMessage(`✅ تم نسيان الجهاز: ${deviceId}`);
        } catch (error) {
            console.error('Failed to remove saved device:', error);
        }
    }

    /**
     * إعادة الاتصال التلقائي بالأجهزة المحفوظة
     */
    async autoReconnectSavedDevices(): Promise<void> {
        const saved = await this.loadWirelessDevices();
        
        if (saved.length === 0) {
            console.log('ℹ️ No saved wireless devices to reconnect');
            return;
        }

        console.log(`🔄 Attempting to reconnect ${saved.length} saved devices...`);

        // إعادة الاتصال بالتوازي (parallel)
        const reconnectPromises = saved.map(device => 
            this.attemptReconnect(device)
        );

        const results = await Promise.allSettled(reconnectPromises);
        
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failCount = results.length - successCount;

        if (successCount > 0) {
            console.log(`✅ Reconnected ${successCount} device(s)`);
        }
        if (failCount > 0) {
            console.warn(`⚠️ Failed to reconnect ${failCount} device(s)`);
        }

        // تحديث الواجهة
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * محاولة إعادة الاتصال بجهاز واحد
     */
    private async attemptReconnect(savedDevice: SavedWirelessDevice): Promise<boolean> {
        const endpoint = `${savedDevice.ipAddress}:${savedDevice.port}`;
        
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            // محاولة الاتصال مع timeout قصير
            await execAsync(`"${this.adbPath}" connect ${endpoint}`, { 
                timeout: 5000 
            });

            console.log(`✅ Reconnected: ${endpoint}`);
            return true;

        } catch (error: any) {
            console.warn(`⚠️ Failed to reconnect ${endpoint}: ${error.message}`);
            return false;
        }
    }

    /**
     * اكتشاف نوع الاتصال بناءً على رقم Port
     */
    private detectConnectionType(port: number): 'wireless-debug' | 'tcpip' {
        // Port 5555 هو الافتراضي لـ TCP/IP
        // Ports أعلى من 30000 عادة تكون Wireless Debugging
        return port === 5555 ? 'tcpip' : 'wireless-debug';
    }

    /**
     * ═══════════════════════════════════════════════════════
     *  DEVICE MANAGEMENT
     * ═══════════════════════════════════════════════════════
     */


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
                            
                            const portNumber = parseInt(port);
                            const device: WirelessDevice = {
                                id: endpoint,
                                type: 'device',
                                state: parts[1] as any,
                                connectionType: this.detectConnectionType(portNumber), // ✅ استخدام اكتشاف تلقائي
                                ipAddress: ip,
                                port: portNumber,
                                model: modelMatch ? modelMatch[1].replace(/_/g, ' ') : undefined,
                                product: productMatch ? productMatch[1] : undefined,
                                device: deviceMatch ? deviceMatch[1] : undefined,
                                lastConnected: Date.now()
                            };
                            
                            this.wirelessDevices.push(device);

                            // ✅ حفظ الجهاز تلقائيًا إذا كان متصلاً
                            if (device.state === 'device') {
                                await this.addSavedDevice(device);
                            }
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
