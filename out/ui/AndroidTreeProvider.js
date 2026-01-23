"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AndroidTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Tree data provider for the Android Control Panel in the sidebar.
 */
class AndroidTreeProvider {
    constructor(deviceManager, buildSystem, logcatManager, wirelessManager) {
        this.deviceManager = deviceManager;
        this.buildSystem = buildSystem;
        this.logcatManager = logcatManager;
        this.wirelessManager = wirelessManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.deviceManager.onDidChangeDevices(() => {
            this.refresh();
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
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
            const items = [
                // Add new device button
                new AndroidTreeItem('➕ Add Wireless Device', 'android.setupWireless', 'action')
            ];
            // Show connected devices
            wirelessDevices.forEach(device => {
                // Connection type icon
                const typeIcon = device.connectionType === 'wireless-debug' ? '📡' : '🔌';
                const label = `${typeIcon} ${device.model || device.ipAddress}`;
                const description = `${device.ipAddress}:${device.port} (${device.connectionType})`;
                const item = new AndroidTreeItem(label, device.id, 'wireless-device');
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
    getDeviceLabel(device, isSelected) {
        const statusIcon = device.state === 'online' || device.state === 'device' ? '🟢' : '🔴';
        // Determine type icon based on device type
        let typeIcon;
        if (device.type === 'emulator') {
            typeIcon = '📱'; // Emulator
        }
        else if (device.id.includes(':')) {
            typeIcon = '📡'; // Wireless device (contains port)
        }
        else {
            typeIcon = '🔌'; // USB device
        }
        const selectedMark = isSelected ? '✓ ' : '  ';
        const name = device.model || device.product || device.id.substring(0, 15);
        return `${selectedMark}${statusIcon} ${typeIcon} ${name}`;
    }
}
exports.AndroidTreeProvider = AndroidTreeProvider;
/**
 * Tree item for the Android Control Panel
 */
class AndroidTreeItem extends vscode.TreeItem {
    constructor(label, resourceId, itemType, collapsibleState = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
        this.label = label;
        this.resourceId = resourceId;
        this.itemType = itemType;
        this.collapsibleState = collapsibleState;
        if (itemType === 'action') {
            this.command = {
                command: resourceId,
                title: label
            };
            this.iconPath = new vscode.ThemeIcon('play-circle');
            this.contextValue = 'androidAction';
        }
        else if (itemType === 'device') {
            this.contextValue = 'androidDevice';
            this.tooltip = `Click to select this device`;
        }
        else if (itemType === 'header') {
            this.contextValue = 'androidHeader';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        else if (itemType === 'empty') {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}
//# sourceMappingURL=AndroidTreeProvider.js.map