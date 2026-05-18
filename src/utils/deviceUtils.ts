import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FriendlyDeviceInfo {
    manufacturer: string;
    marketName?: string;
    model: string;
}

/**
 * Fetches detailed friendly brand, manufacturer, and marketing name for a physical Android device.
 * 
 * @param adbPath Path to the ADB executable
 * @param deviceId The ID/Serial of the target device
 * @param fallbackModel The fallback model name to use if getprop fails or properties are missing
 * @returns An object containing the manufacturer, marketName (if found), and the formatted friendly model name.
 */
export async function fetchFriendlyDeviceInfo(
    adbPath: string,
    deviceId: string,
    fallbackModel: string = ''
): Promise<FriendlyDeviceInfo> {
    try {
        const { stdout: details } = await execAsync(
            `"${adbPath}" -s "${deviceId}" shell "getprop ro.product.manufacturer; getprop ro.product.marketname; getprop ro.product.model"`,
            { timeout: 3000 }
        );
        
        const parts = details.split('\n').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 1) {
            const rawManufacturer = parts[0];
            const manufacturer = rawManufacturer.charAt(0).toUpperCase() + rawManufacturer.slice(1).toLowerCase();
            const marketName = parts[1] || undefined;
            const rawModel = parts[2] || fallbackModel;

            let model = fallbackModel;
            if (marketName) {
                model = `${manufacturer} ${marketName}`;
            } else if (rawModel) {
                const cleanModel = rawModel.replace(/_/g, ' ');
                if (cleanModel.toLowerCase().startsWith(manufacturer.toLowerCase())) {
                    model = cleanModel;
                } else {
                    model = `${manufacturer} ${cleanModel}`;
                }
            }
            
            return {
                manufacturer,
                marketName,
                model
            };
        }
    } catch (e) {
        console.error(`Failed to fetch friendly brand info for device ${deviceId}:`, e);
    }
    
    return {
        manufacturer: 'Unknown',
        model: fallbackModel || 'Unknown Device'
    };
}
