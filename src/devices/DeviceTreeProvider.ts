import * as vscode from 'vscode';
import { DeviceManager, AndroidDevice } from './DeviceManager';

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<DeviceTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private deviceManager: DeviceManager) {
        // تحديث الشجرة عند تغيير الأجهزة
        this.deviceManager.onDidChangeDevices(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DeviceTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DeviceTreeItem): Promise<DeviceTreeItem[]> {
        if (!element) {
            // العناصر الجذرية
            const devices = this.deviceManager.getDevices();
            
            if (devices.length === 0) {
                return [new DeviceTreeItem('لا توجد أجهزة متصلة', '', 'none')];
            }

            return devices.map(device => 
                new DeviceTreeItem(
                    this.getDeviceLabel(device),
                    device.id,
                    'device',
                    device
                )
            );
        }

        return [];
    }

    private getDeviceLabel(device: AndroidDevice): string {
        const statusIcon = device.state === 'online' ? '🟢' : '🔴';
        const typeIcon = device.type === 'emulator' ? '📱' : '🔌';
        const name = device.model || device.product || 'Unknown Device';
        
        return `${statusIcon} ${typeIcon} ${name}`;
    }
}

class DeviceTreeItem extends vscode.TreeItem {
    public tooltip?: string;
    public contextValue?: string;
    public iconPath?: vscode.ThemeIcon;

    constructor(
        public readonly label: string,
        public readonly deviceId: string,
        public readonly itemType: 'device' | 'none',
        public readonly device?: AndroidDevice
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

        if (itemType === 'device' && device) {
            this.tooltip = `${device.model || 'Unknown'}\nID: ${device.id}\nState: ${device.state}`;
            this.contextValue = 'androidDevice';
            this.iconPath = new vscode.ThemeIcon(
                device.type === 'emulator' ? 'device-mobile' : 'device-camera'
            );
        } else {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}
