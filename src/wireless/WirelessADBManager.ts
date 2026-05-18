import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WirelessDebugger } from './WirelessDebugger';
import { TcpIpConnector } from './TcpIpConnector';
import { AndroidDevice } from '../devices/DeviceManager';

const execAsync = promisify(exec);

/**
 * Represents a wirelessly connected Android device
 */
export interface WirelessDevice extends AndroidDevice {
    connectionType: 'wireless-debug' | 'tcpip';
    ipAddress: string;
    port: number;
    paired?: boolean;
    lastConnected?: number; // timestamp
}

/**
 * Saved wireless device configuration for persistence
 */
export interface SavedWirelessDevice {
    id: string;
    ipAddress: string;
    port: number;
    connectionType: 'wireless-debug' | 'tcpip';
    model?: string;
    lastConnected: number;
}

/**
 * Manages wireless ADB connections including Wireless Debugging (Android 11+) and TCP/IP.
 */
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
     * Open wireless connection setup UI
     */
    async setupWirelessConnection(): Promise<void> {
        // Show Quick Pick to select method
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
     * Prompt user to select connection method
     */
    private async promptConnectionMethod(): Promise<'wireless-debug' | 'tcpip' | null> {
        const items = [
            {
                label: '$(radio-tower) Wireless Debugging',
                description: 'Android 11+ - Easiest',
                detail: 'Use QR Code or Pairing Code',
                method: 'wireless-debug' as const
            },
            {
                label: '$(plug) ADB over TCP/IP',
                description: 'Android 4.0+ - Requires USB once',
                detail: 'For older devices',
                method: 'tcpip' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select wireless connection method'
        });

        return selected?.method || null;
    }

    /**
     * Setup Wireless Debugging (Android 11+)
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
                '⚠️ QR Code pairing will be added soon. Use Pairing Code for now.'
            );
        }

        // Update device list
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * Setup ADB over TCP/IP
     */
    private async setupTcpIp(): Promise<void> {
        await this.tcpIpConnector.setupConnection();
        
        // Update device list
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * ═══════════════════════════════════════════════════════
     *  PERSISTENCE SYSTEM
     * ═══════════════════════════════════════════════════════
     */

    /**
     * Save all current wireless devices
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
     * Load saved devices from storage
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
     * Add device to saved list
     */
    async addSavedDevice(device: WirelessDevice): Promise<void> {
        try {
            const saved = await this.loadWirelessDevices();
            
            // Remove old version if exists
            const filtered = saved.filter(d => d.id !== device.id);
            
            // Add new device
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
     * Remove device from saved list
     */
    async removeSavedDevice(deviceId: string): Promise<void> {
        try {
            const saved = await this.loadWirelessDevices();
            const filtered = saved.filter(d => d.id !== deviceId);
            await this.context.globalState.update(this.STORAGE_KEY, filtered);
            console.log(`🗑️ Removed device from saved list: ${deviceId}`);
            
            vscode.window.showInformationMessage(`✅ Device forgotten: ${deviceId}`);
        } catch (error) {
            console.error('Failed to remove saved device:', error);
        }
    }

    /**
     * Get list of saved wireless devices
     */
    async getSavedDevices(): Promise<SavedWirelessDevice[]> {
        return this.loadWirelessDevices();
    }

    /**
     * Connect to a specific saved device
     */
    async connectSavedDevice(savedDevice: SavedWirelessDevice): Promise<boolean> {
        return this.attemptReconnect(savedDevice);
    }

    /**
     * Auto-reconnect to saved devices on startup
     */
    async autoReconnectSavedDevices(): Promise<void> {
        const saved = await this.loadWirelessDevices();
        
        if (saved.length === 0) {
            console.log('ℹ️ No saved wireless devices to reconnect');
            return;
        }

        console.log(`🔄 Attempting to reconnect ${saved.length} saved devices...`);

        // Reconnect in parallel
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

        // Update UI
        this.onDidChangeDevicesEmitter.fire();
    }

    /**
     * Attempt to reconnect a single device
     */
    private async attemptReconnect(savedDevice: any): Promise<boolean> {
        let endpoint = savedDevice.id;
        if (savedDevice.ipAddress && savedDevice.port) {
            endpoint = `${savedDevice.ipAddress}:${savedDevice.port}`;
        }
        
        try {
            // Attempt connection with short timeout
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
     * Detect connection type based on port number
     */
    private detectConnectionType(port: number): 'wireless-debug' | 'tcpip' {
        // Port 5555 is default for TCP/IP
        // Ports above 30000 are usually Wireless Debugging
        return port === 5555 ? 'tcpip' : 'wireless-debug';
    }

    /**
     * ═══════════════════════════════════════════════════════
     *  DEVICE MANAGEMENT
     * ═══════════════════════════════════════════════════════
     */


    /**
     * Disconnect a wireless device
     */
    async disconnectDevice(device: any): Promise<void> {
        let endpoint = device.id;
        if (device.ipAddress && device.port) {
            endpoint = `${device.ipAddress}:${device.port}`;
        }
        
        try {
            await execAsync(`"${this.adbPath}" disconnect ${endpoint}`);
            
            // Remove from list
            this.wirelessDevices = this.wirelessDevices.filter(d => d.id !== device.id);
            
            vscode.window.showInformationMessage(`✅ Disconnected: ${device.model || endpoint}`);
            this.onDidChangeDevicesEmitter.fire();
        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Failed to disconnect: ${error.message}`);
        }
    }

    /**
     * Get list of connected wireless devices
     */
    getWirelessDevices(): WirelessDevice[] {
        return this.wirelessDevices;
    }

    /**
     * Refresh wireless device list
     */
    async refreshWirelessDevices(): Promise<void> {
        try {
            const { stdout } = await execAsync(`"${this.adbPath}" devices -l`);
            const lines = stdout.split('\n');
            
            this.wirelessDevices = [];
            
            for (const line of lines) {
                if (line && !line.startsWith('List of devices') && line.trim()) {
                    // Look for wireless devices (contain :)
                    if (line.includes(':')) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 2) {
                            const endpoint = parts[0];
                            const [ip, port] = endpoint.split(':');
                            
                            // Extract additional info
                            const modelMatch = line.match(/model:([^\s]+)/);
                            const productMatch = line.match(/product:([^\s]+)/);
                            const deviceMatch = line.match(/device:([^\s]+)/);
                            
                            const portNumber = parseInt(port);
                            const device: WirelessDevice = {
                                id: endpoint,
                                type: 'device',
                                state: parts[1] as any,
                                connectionType: this.detectConnectionType(portNumber), // Auto-detect
                                ipAddress: ip,
                                port: portNumber,
                                model: modelMatch ? modelMatch[1].replace(/_/g, ' ') : undefined,
                                product: productMatch ? productMatch[1] : undefined,
                                device: deviceMatch ? deviceMatch[1] : undefined,
                                lastConnected: Date.now()
                            };
                            
                            this.wirelessDevices.push(device);

                            // Auto-save device if connected
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
