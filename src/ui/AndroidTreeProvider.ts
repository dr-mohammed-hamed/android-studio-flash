import * as vscode from 'vscode';
import { DeviceManager, AndroidDevice } from '../devices/DeviceManager';
import { BuildSystem } from '../build/BuildSystem';
import { LogcatManager } from '../logcat/LogcatManager';
import { WirelessADBManager } from '../wireless/WirelessADBManager';

type TreeItemType = 'header' | 'device' | 'action' | 'empty' | 'wireless-device';

/**
 * Tree data provider for the Android Control Panel in the sidebar.
 */
export class AndroidTreeProvider implements vscode.TreeDataProvider<AndroidTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AndroidTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private deviceManager: DeviceManager,
        private buildSystem: BuildSystem,
        private logcatManager: LogcatManager,
        private wirelessManager: WirelessADBManager
    ) {
        this.deviceManager.onDidChangeDevices(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AndroidTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AndroidTreeItem): Promise<AndroidTreeItem[]> {
        if (!element) {
            // Root elements
            return [
                // Build Actions section
                new AndroidTreeItem('🔨 Build Actions', '', 'header', vscode.TreeItemCollapsibleState.Expanded),
                
                // Devices section
                new AndroidTreeItem('📱 Devices', '', 'header', vscode.TreeItemCollapsibleState.Expanded),
                
                // Wireless Devices section
                new AndroidTreeItem('📡 Wireless Devices', '', 'header', vscode.TreeItemCollapsibleState.Expanded),
                
                // Tools section
                new AndroidTreeItem('🛠️ Tools', '', 'header', vscode.TreeItemCollapsibleState.Expanded)
            ];
        }

        // Children based on section
        if (element.label === '🔨 Build Actions') {
            return [
                new AndroidTreeItem('▶️  Build & Run', 'android.runApp', 'action'),
                new AndroidTreeItem('🔨 Build Debug APK', 'android.buildDebug', 'action'),
                new AndroidTreeItem('📦 Build Release APK', 'android.buildRelease', 'action'),
                new AndroidTreeItem('🧹 Clean Project', 'android.cleanProject', 'action'),
                new AndroidTreeItem('🔄 Sync Gradle', 'android.syncGradle', 'action')
            ];
        }

        if (element.label === '📱 Devices') {
            const devices = this.deviceManager.getDevices();
            const selectedDevice = this.deviceManager.getSelectedDevice();

            if (devices.length === 0) {
                return [new AndroidTreeItem('⚠️  No devices connected', '', 'empty')];
            }

            return devices.map(device => {
                const isSelected = selectedDevice?.id === device.id;
                const label = this.getDeviceLabel(device, isSelected);
                const item = new AndroidTreeItem(label, device.id, 'device');
                item.device = device;
                item.command = {
                    command: 'android.selectDeviceFromTree',
                    title: 'Select Device',
                    arguments: [device]
                };
                return item;
            });
        }

        if (element.label === '📡 Wireless Devices') {
            const wirelessDevices = this.wirelessManager.getWirelessDevices();
            
            const items: AndroidTreeItem[] = [
                // Add new device button
                new AndroidTreeItem('➕ Add Wireless Device', 'android.setupWireless', 'action')
            ];

            // Show connected devices
            wirelessDevices.forEach(device => {
                // Connection type icon
                const typeIcon = device.connectionType === 'wireless-debug' ? '📡' : '🔌';
                const label = `${typeIcon} ${device.model || device.ipAddress}`;
                const description = `${device.ipAddress}:${device.port} (${device.connectionType})`;
                
                const item = new AndroidTreeItem(
                    label,
                    device.id,
                    'wireless-device'
                );
                item.device = device;
                item.contextValue = 'wirelessDevice';
                item.description = description;
                item.tooltip = `${device.connectionType === 'wireless-debug' ? 'Wireless Debugging' : 'TCP/IP'}\n${device.ipAddress}:${device.port}`;
                items.push(item);
            });

            if (wirelessDevices.length === 0) {
                items.push(new AndroidTreeItem('⚠️ No wireless devices', '', 'empty'));
            }

            return items;
        }

        if (element.label === '🛠️ Tools') {
            return [
                new AndroidTreeItem('📋 Show Logcat', 'android.showLogcat', 'action'),
                new AndroidTreeItem('🔍 Logcat Filter Mode', 'android.toggleLogcatFilter', 'action'),
                new AndroidTreeItem('🗑️  Clear Logcat', 'android.clearLogcat', 'action'),
                new AndroidTreeItem('⏹️  Stop Logcat', 'android.stopLogcat', 'action'),
                new AndroidTreeItem('🔄 Refresh Devices', 'android.refreshDevices', 'action')
            ];
        }

        return [];
    }

    /**
     * Get device label with status and type icons
     */
    private getDeviceLabel(device: AndroidDevice, isSelected: boolean): string {
        const statusIcon = device.state === 'online' || device.state === 'device' ? '🟢' : '🔴';
        
        // Determine type icon based on device type
        let typeIcon: string;
        if (device.type === 'emulator') {
            typeIcon = '📱'; // Emulator
        } else if (device.id.includes(':')) {
            typeIcon = '📡'; // Wireless device (contains port)
        } else {
            typeIcon = '🔌'; // USB device
        }
        
        const selectedMark = isSelected ? '✓ ' : '  ';
        const name = device.model || device.product || device.id.substring(0, 15);
        
        return `${selectedMark}${statusIcon} ${typeIcon} ${name}`;
    }
}

/**
 * Tree item for the Android Control Panel
 */
class AndroidTreeItem extends vscode.TreeItem {
    public device?: AndroidDevice;

    constructor(
        public readonly label: string,
        public readonly resourceId: string,
        public readonly itemType: TreeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);

        if (itemType === 'action') {
            this.command = {
                command: resourceId,
                title: label
            };
            this.iconPath = new vscode.ThemeIcon('play-circle');
            this.contextValue = 'androidAction';
        } else if (itemType === 'device') {
            this.contextValue = 'androidDevice';
            this.tooltip = `Click to select this device`;
        } else if (itemType === 'header') {
            this.contextValue = 'androidHeader';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (itemType === 'empty') {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}
