import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

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
            const devices: ScannedDevice[] = [];
            const port = 5555; // Default ADB port

            // Scan from .1 to .254 (with speed optimization)
            // Testing only a sample of addresses for speed
            const ipsToTest: string[] = [];
            
            // Test common addresses first
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
                    message: `Checking ${ip}... (${tested}/${ipsToTest.length})`,
                    increment: (100 / ipsToTest.length)
                });

                // Attempt connection (without long timeout)
                if (await this.testConnection(ip, port)) {
                    devices.push({ ip, port });
                }
            }

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
     * Test connection to IP:Port
     */
    private async testConnection(ip: string, port: number): Promise<boolean> {
        try {
            const endpoint = `${ip}:${port}`;
            
            // Quick connection attempt with short timeout
            const { stdout } = await execAsync(
                `"${this.adbPath}" connect ${endpoint}`,
                { timeout: 1500 } // 1.5 seconds timeout only
            );

            // If connection succeeded
            if (stdout.includes('connected')) {
                // Disconnect immediately (testing only)
                try {
                    await execAsync(`"${this.adbPath}" disconnect ${endpoint}`, { timeout: 500 });
                } catch (e) {
                    // Ignore disconnect errors
                }
                return true;
            }

            return false;

        } catch (error) {
            // Connection failed = device not found
            return false;
        }
    }
}
