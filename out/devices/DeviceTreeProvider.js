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
exports.DeviceTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class DeviceTreeProvider {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // تحديث الشجرة عند تغيير الأجهزة
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
            // العناصر الجذرية
            const devices = this.deviceManager.getDevices();
            if (devices.length === 0) {
                return [new DeviceTreeItem('لا توجد أجهزة متصلة', '', 'none')];
            }
            return devices.map(device => new DeviceTreeItem(this.getDeviceLabel(device), device.id, 'device', device));
        }
        return [];
    }
    getDeviceLabel(device) {
        const statusIcon = device.state === 'online' ? '🟢' : '🔴';
        const typeIcon = device.type === 'emulator' ? '📱' : '🔌';
        const name = device.model || device.product || 'Unknown Device';
        return `${statusIcon} ${typeIcon} ${name}`;
    }
}
exports.DeviceTreeProvider = DeviceTreeProvider;
class DeviceTreeItem extends vscode.TreeItem {
    constructor(label, deviceId, itemType, device) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.deviceId = deviceId;
        this.itemType = itemType;
        this.device = device;
        if (itemType === 'device' && device) {
            this.tooltip = `${device.model || 'Unknown'}\nID: ${device.id}\nState: ${device.state}`;
            this.contextValue = 'androidDevice';
            this.iconPath = new vscode.ThemeIcon(device.type === 'emulator' ? 'device-mobile' : 'device-camera');
        }
        else {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}
//# sourceMappingURL=DeviceTreeProvider.js.map