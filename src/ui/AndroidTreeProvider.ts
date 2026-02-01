import * as vscode from 'vscode';
import { DeviceManager, AndroidDevice } from '../devices/DeviceManager';
import { BuildSystem } from '../build/BuildSystem';
import { LogcatManager } from '../logcat/LogcatManager';
import { WirelessADBManager } from '../wireless/WirelessADBManager';
import { GradleService } from '../core/GradleService';
import { GradleModuleService } from '../core/GradleModuleService';

type TreeItemType = 'header' | 'device' | 'action' | 'empty' | 'wireless-device' | 'module';

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
        private wirelessManager: WirelessADBManager,
        private gradleService: GradleService,
        private gradleModuleService: GradleModuleService
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

                // Devices section (Now includes wireless controls)
                new AndroidTreeItem('📱 Devices', '', 'header', vscode.TreeItemCollapsibleState.Expanded),
                
                // Note: "Wireless Devices" folder has been removed as requested
                
                // Tools section
                new AndroidTreeItem('🛠️ Tools', '', 'header', vscode.TreeItemCollapsibleState.Expanded)
            ];
        }

        // Children based on section
        if (element.label === '🔨 Build Actions') {
            const children: AndroidTreeItem[] = [];

            // 1. Module Selector (Nested Folder)
            const currentModule = this.gradleService.getTargetModule() || '(Project Root)';
            
            // This item acts as a folder containing the modules
            const moduleItem = new AndroidTreeItem(
                `📦 Target: ${currentModule}`, 
                '', 
                'header', // Use header type for folder icon behavior or customized below
                vscode.TreeItemCollapsibleState.Collapsed
            );
            moduleItem.contextValue = 'androidModuleGroup'; // Special context if needed
            children.push(moduleItem);

            // 2. Build Commands
            children.push(new AndroidTreeItem('▶️  Build & Run', 'android.runApp', 'action'));
            children.push(new AndroidTreeItem('🔨 Build Debug APK', 'android.buildDebug', 'action'));
            children.push(new AndroidTreeItem('📦 Build Release APK', 'android.buildRelease', 'action'));
            children.push(new AndroidTreeItem('🧹 Clean Project', 'android.cleanProject', 'action'));
            children.push(new AndroidTreeItem('🔄 Sync Gradle', 'android.syncGradle', 'action'));

            return children;
        }

        // Handle the "Target" item specifically
        if (element.label.startsWith('📦 Target:')) {
            const items: AndroidTreeItem[] = [];
            try {
                const root = this.gradleService.findProjectRoot();
                const modules = await this.gradleModuleService.getModules(root);
                const currentModule = this.gradleService.getTargetModule(); // null means Project Root

                // Add Project Root explicitly if not in list
                if (!modules.includes('(Project Root)')) {
                    modules.unshift('(Project Root)');
                }

                modules.forEach(module => {
                    // Check if this module is selected
                    const isSelected = (module === '(Project Root)' && currentModule === null) || 
                                       (module === currentModule);
                    
                    const label = isSelected ? `✓ ${module}` : module;
                    
                    const item = new AndroidTreeItem(label, module, 'module');
                    item.moduleName = module; // Custom property
                    item.contextValue = 'androidModule';
                    
                    // Command to select this module
                    item.command = {
                        command: 'android.selectModuleFromTree',
                        title: 'Select Module',
                        arguments: [module]
                    };
                    
                    if (isSelected) {
                        item.description = 'Active';
                    }

                    items.push(item);
                });
            } catch (error) {
                items.push(new AndroidTreeItem('⚠️ Error loading modules', '', 'empty'));
            }
            return items;
        }

        if (element.label === '📱 Devices') {
            const items: AndroidTreeItem[] = [];
            const devices = this.deviceManager.getDevices();
            const selectedDevice = this.deviceManager.getSelectedDevice();

            // 1. List all connected devices (USB + Wireless)
            if (devices.length > 0) {
                devices.forEach(device => {
                    const isSelected = selectedDevice?.id === device.id;
                    const label = this.getDeviceLabel(device, isSelected);
                    const item = new AndroidTreeItem(label, device.id, 'device');
                    item.device = device;
                    item.command = {
                        command: 'android.selectDeviceFromTree',
                        title: 'Select Device',
                        arguments: [device]
                    };
                    items.push(item);
                });
            } else {
                // If no devices, show an information item
                items.push(new AndroidTreeItem('⚠️  No devices connected', '', 'empty'));
            }

            // 2. Add Wireless Device Option (Moved here as requested)
            items.push(new AndroidTreeItem('➕ Add Wireless Device', 'android.setupWireless', 'action'));

            // 3. Reload Devices Option (Moved here as requested)
            items.push(new AndroidTreeItem('🔄 Refresh Devices', 'android.refreshDevices', 'action'));

            return items;
        }

        // Note: The "Wireless Devices" block has been completely removed.

        if (element.label === '🛠️ Tools') {
            return [
                new AndroidTreeItem('📋 Show Logcat', 'android.showLogcat', 'action'),
                new AndroidTreeItem('🔍 Logcat Filter Mode', 'android.toggleLogcatFilter', 'action'),
                new AndroidTreeItem('🗑️  Clear Logcat', 'android.clearLogcat', 'action'),
                new AndroidTreeItem('⏹️  Stop Logcat', 'android.stopLogcat', 'action'),
                new AndroidTreeItem('🔐 Create Signing Key', 'android.createKeystore', 'action'),
                new AndroidTreeItem('🔍 Run Diagnostics', 'android.runDiagnostics', 'action')
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
    public moduleName?: string;

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
        } else if (itemType === 'module') {
            this.contextValue = 'androidModule';
            this.iconPath = new vscode.ThemeIcon('package');
        } else if (itemType === 'header') {
            this.contextValue = 'androidHeader';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (itemType === 'empty') {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}