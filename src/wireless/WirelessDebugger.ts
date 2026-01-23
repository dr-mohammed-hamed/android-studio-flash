import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type PairingMethod = 'pairing-code' | 'qr-code';

/**
 * Handles Wireless Debugging pairing for Android 11+ devices.
 */
export class WirelessDebugger {
    constructor(private adbPath: string) {}

    /**
     * Prompt user to select pairing method
     */
    async promptPairingMethod(): Promise<PairingMethod | null> {
        const items = [
            {
                label: '$(key) Pairing Code',
                description: 'Use 6-digit code',
                detail: 'Settings → Developer options → Wireless debugging → Pair device with pairing code',
                method: 'pairing-code' as const
            },
            {
                label: '$(device-camera) QR Code',
                description: 'Scan QR Code (coming soon)',
                detail: 'Settings → Developer options → Wireless debugging → Pair device with QR code',
                method: 'qr-code' as const
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'How would you like to pair the device?'
        });

        return selected?.method || null;
    }

    /**
     * Pair using pairing code
     */
    async pairWithCode(): Promise<void> {
        // Step 1: Ask user to enable Wireless Debugging
        const confirmed = await vscode.window.showInformationMessage(
            '📱 On your device:\n' +
            '1. Open Settings → Developer options → Wireless debugging\n' +
            '2. Enable Wireless debugging\n' +
            '3. Tap "Pair device with pairing code"\n' +
            '4. Keep the screen open',
            'Ready ✅',
            'Cancel'
        );

        if (confirmed !== 'Ready ✅') {
            return;
        }

        // Step 2: Ask for IP and Port
        const ipPort = await vscode.window.showInputBox({
            prompt: 'Enter IP Address:Port (e.g., 192.168.1.100:45678)',
            placeHolder: '192.168.1.100:45678',
            validateInput: (value) => {
                const regex = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
                return regex.test(value) ? null : 'Invalid format. Use: IP:PORT';
            }
        });

        if (!ipPort) {
            return;
        }

        // Step 3: Ask for Pairing Code
        const pairingCode = await vscode.window.showInputBox({
            prompt: 'Enter the 6-digit Pairing Code',
            placeHolder: '123456',
            validateInput: (value) => {
                return /^\d{6}$/.test(value) ? null : 'Must be 6 digits';
            }
        });

        if (!pairingCode) {
            return;
        }

        // Step 4: Execute Pairing
        await this.executePairing(ipPort, pairingCode);
    }

    /**
     * Execute pairing operation
     */
    private async executePairing(ipPort: string, pairingCode: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔄 Pairing...',
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

            // Pairing successful - now connect
            await this.connectAfterPairing(ipPort.split(':')[0]);

        } catch (error: any) {
            vscode.window.showErrorMessage(
                `❌ Pairing failed: ${error.message}\n\n` +
                'Make sure:\n' +
                '• Device and computer are on the same network\n' +
                '• Pairing Code is correct\n' +
                '• IP:Port is correct'
            );
        }
    }

    /**
     * Connect after successful pairing
     */
    private async connectAfterPairing(deviceIp: string): Promise<void> {
        // After pairing, we need to connect to the device
        // Usually on a different port (shown in "Wireless debugging" screen)
        
        const port = await vscode.window.showInputBox({
            prompt: 'On the device, go back to the main Wireless debugging screen\n' +
                    'Enter the Port number shown under "Device name" (e.g., 37843)',
            placeHolder: '37843',
            validateInput: (value) => {
                return /^\d+$/.test(value) ? null : 'Must be a number';
            }
        });

        if (!port) {
            return;
        }

        const endpoint = `${deviceIp}:${port}`;

        try {
            await execAsync(`"${this.adbPath}" connect ${endpoint}`);
            
            vscode.window.showInformationMessage(
                `✅ Connected successfully!\n${endpoint}\n\n` +
                'You can now disconnect the USB cable (if connected)'
            );

            // Refresh device list
            vscode.commands.executeCommand('android.refreshDevices');

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Connection failed: ${error.message}`);
        }
    }
}
