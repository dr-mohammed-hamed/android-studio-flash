import * as os from 'os';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { fetchFriendlyDeviceInfo } from '../utils/deviceUtils';

const execAsync = promisify(exec);

/**
 * Represents a device found during network scan
 */
export interface ScannedDevice {
    ip: string;
    port: number;
    name?: string;
}

/**
 * Scans the local network for Android devices with ADB enabled.
 * Uses super-fast raw TCP sockets to probe for port 5555 before calling ADB,
 * enabling full-subnet /24 scanning (254 IPs) in parallel under 2-3 seconds.
 */
export class NetworkScanner {
    constructor(private adbPath: string) {}

    /**
     * Scan local network for Android devices
     */
    async scanNetwork(): Promise<ScannedDevice[]> {
        const localIp = this.getLocalIp();
        if (!localIp) {
            vscode.window.showErrorMessage('❌ Could not determine local IP');
            return [];
        }

        // Extract subnet (e.g., 192.168.1)
        const subnet = localIp.substring(0, localIp.lastIndexOf('.'));

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔍 Scanning network...',
            cancellable: true
        }, async (progress, token) => {
            const activeIps: string[] = [];
            const port = 5555; // Default ADB port

            // Generate all 254 subnet addresses
            const ipsToTest: string[] = [];
            for (let i = 1; i <= 254; i++) {
                ipsToTest.push(`${subnet}.${i}`);
            }

            // Group the 254 IPs into concurrent batches of 50 to avoid socket resource depletion
            const batchSize = 50;
            let tested = 0;

            for (let i = 0; i < ipsToTest.length; i += batchSize) {
                if (token.isCancellationRequested) {
                    break;
                }

                const batch = ipsToTest.slice(i, i + batchSize);
                
                // Scan batch in parallel
                const batchPromises = batch.map(async (ip) => {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    
                    const isOpen = await this.probeAdbPort(ip, port, 1000);
                    if (isOpen) {
                        activeIps.push(ip);
                    }
                });

                await Promise.all(batchPromises);

                tested += batch.length;
                progress.report({
                    message: `Scanning subnet ${subnet}.x... (${tested}/${ipsToTest.length})`,
                    increment: (batch.length / ipsToTest.length) * 100
                });
            }

            if (activeIps.length === 0) {
                return [];
            }

            // Step 2: Fetch friendly device names for discovered active IPs in parallel using ADB
            const devices: ScannedDevice[] = [];
            progress.report({ message: `Fetching friendly name for ${activeIps.length} active device(s)...` });

            const fetchPromises = activeIps.map(async (ip) => {
                const endpoint = `${ip}:${port}`;
                let modelName = 'Wireless Device';
                
                try {
                    // Try to connect to query info
                    const { stdout } = await execAsync(`"${this.adbPath}" connect ${endpoint}`, { timeout: 3000 });
                    if (stdout.includes('connected')) {
                        // Fetch using our awesome friendly brand utility
                        const info = await fetchFriendlyDeviceInfo(this.adbPath, endpoint, 'Wireless Device');
                        modelName = info.model;
                        
                        // Disconnect so we don't hold the connection unless needed
                        await execAsync(`"${this.adbPath}" disconnect ${endpoint}`, { timeout: 2000 });
                    }
                } catch (e) {
                    console.error(`Failed to connect & query info for ${endpoint}`, e);
                }

                devices.push({
                    ip,
                    port,
                    name: `${modelName} (${ip}:${port})`
                });
            });

            await Promise.all(fetchPromises);
            return devices;
        });
    }

    /**
     * Get local IP address
     */
    private getLocalIp(): string | null {
        const interfaces = os.networkInterfaces();
        
        for (const name of Object.keys(interfaces)) {
            const iface = interfaces[name];
            if (!iface) {
                continue;
            }

            for (const alias of iface) {
                // IPv4 and not loopback
                if (alias.family === 'IPv4' && !alias.internal) {
                    return alias.address;
                }
            }
        }

        return null;
    }

    /**
     * Fast TCP port probe using raw Node sockets
     */
    private probeAdbPort(ip: string, port: number, timeout: number = 1000): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            
            socket.setTimeout(timeout);
            
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            
            socket.once('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            
            socket.once('error', () => {
                socket.destroy();
                resolve(false);
            });
            
            socket.connect(port, ip);
        });
    }
}
