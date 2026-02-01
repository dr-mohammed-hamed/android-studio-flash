import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { NetworkScanner, ScannedDevice } from './NetworkScanner';

const execAsync = promisify(exec);

/**
 * Handles ADB over TCP/IP connections for devices running Android 4.0+.
 * Requires initial USB connection to enable TCP/IP mode.
 */
export class TcpIpConnector {
    private scanner: NetworkScanner;

    constructor(private adbPath: string) {
        this.scanner = new NetworkScanner(adbPath);
    }

    /**
     * Setup ADB over TCP/IP connection
     */
    async setupConnection(): Promise<void> {
        // Show instructions
        const method = await vscode.window.showQuickPick([
            {
                label: '$(usb) Device connected via USB',
                description: 'Device is currently connected with USB cable',
                value: 'usb' as const
            },
            {
                label: '$(globe) Device on network',
                description: 'Device was previously configured',
                value: 'network' as const
            }
        ], {
            placeHolder: 'What is the device status?'
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
     * Setup from USB-connected device
     */
    private async setupFromUsb(): Promise<void> {
        try {
            // Step 1: Get list of USB-connected devices
            const { stdout } = await execAsync(`"${this.adbPath}" devices`);
            const usbDevices = this.parseUsbDevices(stdout);

            if (usbDevices.length === 0) {
                vscode.window.showWarningMessage('⚠️ No USB devices connected');
                return;
            }

            // Step 2: Select device (if more than one)
            let selectedDeviceId: string;
            
            if (usbDevices.length === 1) {
                selectedDeviceId = usbDevices[0];
            } else {
                const selected = await vscode.window.showQuickPick(
                    usbDevices.map(id => ({ label: id, value: id })),
                    { placeHolder: 'Select device' }
                );
                if (!selected) {
                    return;
                }
                selectedDeviceId = selected.value;
            }

            // Step 3: Switch device to TCP/IP mode
            await this.enableTcpIpMode(selectedDeviceId);

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Error: ${error.message}`);
        }
    }

    /**
     * Parse USB devices from adb output
     */
    private parseUsbDevices(adbOutput: string): string[] {
        const lines = adbOutput.split('\n');
        const devices: string[] = [];

        for (const line of lines) {
            if (line && !line.startsWith('List of devices') && line.trim()) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2 && parts[1] === 'device') {
                    // Ignore wireless devices (containing :)
                    if (!parts[0].includes(':')) {
                        devices.push(parts[0]);
                    }
                }
            }
        }

        return devices;
    }

    /**
     * Enable TCP/IP mode on device
     */
    private async enableTcpIpMode(deviceId: string, port: number = 5555): Promise<void> {
        try {
            // Get IP **before** enabling TCP/IP mode
            // Because device will disconnect from USB after execution!
            const deviceIp = await this.getDeviceIp(deviceId);

            if (!deviceIp) {
                vscode.window.showWarningMessage(
                    '⚠️ Could not get device IP.\n' +
                    'Make sure the device is connected to WiFi and try again.'
                );
                // Fallback to manual connection
                await this.connectToExistingDevice(port);
                return;
            }

            // Now enable TCP/IP mode
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔄 Enabling TCP/IP mode...',
                cancellable: false
            }, async () => {
                // adb -s DEVICE tcpip PORT
                await execAsync(`"${this.adbPath}" -s ${deviceId} tcpip ${port}`);
            });

            // Wait briefly after enabling
            await this.sleep(1500);

            // Show device IP clearly before disconnecting cable
            const endpoint = `${deviceIp}:${port}`;
            
            const action = await vscode.window.showInformationMessage(
                `✅ TCP/IP mode enabled successfully!\n\n` +
                `📱 Device: ${deviceId}\n` +
                `🌐 Connection address: ${endpoint}\n\n` +
                `You can now disconnect the USB cable and connect wirelessly.`,
                {
                    modal: true,
                    detail: 'Connection will be established automatically after confirmation.'
                },
                'Connect now ✅',
                'Copy IP 📋',
                'Cancel'
            );

            if (action === 'Copy IP 📋') {
                // Copy IP to clipboard
                await vscode.env.clipboard.writeText(endpoint);
                vscode.window.showInformationMessage(`📋 Copied: ${endpoint}`);
                
                // Show options again
                const retryAction = await vscode.window.showInformationMessage(
                    `IP copied: ${endpoint}\n\nDo you want to connect now?`,
                    'Connect now ✅',
                    'Cancel'
                );
                
                if (retryAction === 'Connect now ✅') {
                    await this.connectToDevice(deviceIp, port);
                }
            } else if (action === 'Connect now ✅') {
                // Connect directly
                await this.connectToDevice(deviceIp, port);
            }
            // If "Cancel" - do nothing

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Failed to enable TCP/IP: ${error.message}`);
        }
    }

    /**
     * Get device IP address (while still connected via USB).
     * Searches multiple network interfaces to support various connection modes:
     * - wlan0: Standard WiFi connection (device connected to router/hotspot)
     * - ap0/swlan0/wlan1: Hotspot mode (device IS the hotspot)
     * - rndis0: USB tethering interface
     */
    private async getDeviceIp(deviceId: string): Promise<string | null> {
        try {
            // Get ALL network interfaces instead of just wlan0
            // This allows detection when device is acting as a Hotspot
            const { stdout } = await execAsync(
                `"${this.adbPath}" -s ${deviceId} shell ip addr`,
                { timeout: 5000 }
            );

            // Search for private network IPs in order of priority:
            // 1. 192.168.x.x (most common for WiFi/Hotspot)
            // 2. 10.x.x.x (some networks use this range)
            // 3. 172.16-31.x.x (less common private range)
            const privateIpPatterns = [
                /inet\s+(192\.168\.\d+\.\d+)/,
                /inet\s+(10\.\d+\.\d+\.\d+)/,
                /inet\s+(172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/
            ];

            for (const pattern of privateIpPatterns) {
                const match = stdout.match(pattern);
                if (match && match[1]) {
                    console.log(`✅ Got device IP: ${match[1]}`);
                    return match[1];
                }
            }
            
            console.warn('⚠️ No private IP found in any network interface');
            return null;

        } catch (error: any) {
            console.error('Failed to get device IP:', error.message);
            return null;
        }
    }

    /**
     * Helper function for delay
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Connect to existing device on network
     */
    private async connectToExistingDevice(defaultPort: number = 5555): Promise<void> {
        // Option 1: Manual input
        // Option 2: Network scan
        const method = await vscode.window.showQuickPick([
            {
                label: '$(edit) Enter IP manually',
                value: 'manual' as const
            },
            {
                label: '$(search) Scan network',
                description: 'Search for devices automatically (may take time)',
                value: 'scan' as const
            }
        ], {
            placeHolder: 'How would you like to find the device?'
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
     * Manual connection
     */
    private async connectManually(defaultPort: number): Promise<void> {
        const ipAddress = await vscode.window.showInputBox({
            prompt: 'Enter device IP Address (find it in Settings → About → Status)',
            placeHolder: '192.168.1.100',
            validateInput: (value) => {
                const regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                return regex.test(value) ? null : 'Invalid IP format';
            }
        });

        if (!ipAddress) {
            return;
        }

        await this.connectToDevice(ipAddress, defaultPort);
    }

    /**
     * Scan network and connect
     */
    private async scanAndConnect(): Promise<void> {
        const foundDevices = await this.scanner.scanNetwork();

        if (foundDevices.length === 0) {
            vscode.window.showWarningMessage('⚠️ No devices found');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            foundDevices.map((device: ScannedDevice) => ({
                label: device.name || device.ip,
                description: device.ip,
                deviceInfo: device
            })),
            { placeHolder: 'Select a device' }
        );

        if (!selected) {
            return;
        }

        await this.connectToDevice(selected.deviceInfo.ip, selected.deviceInfo.port);
    }

    /**
     * Connect to a device
     */
    private async connectToDevice(ip: string, port: number): Promise<void> {
        const endpoint = `${ip}:${port}`;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `🔄 Connecting to ${endpoint}...`,
                cancellable: false
            }, async () => {
                await execAsync(`"${this.adbPath}" connect ${endpoint}`);
            });

            vscode.window.showInformationMessage(
                `✅ Connected successfully!\n${endpoint}\n\n` +
                'You can now disconnect the USB cable'
            );

            // Refresh device list
            vscode.commands.executeCommand('android.refreshDevices');

        } catch (error: any) {
            vscode.window.showErrorMessage(
                `❌ Failed to connect to ${endpoint}: ${error.message}\n\n` +
                'Make sure:\n' +
                '• Device and computer are on the same network\n' +
                '• IP Address is correct\n' +
                '• Developer options are enabled on the device'
            );
        }
    }
}
