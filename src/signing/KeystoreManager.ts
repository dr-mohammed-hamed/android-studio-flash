import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Certificate information for keystore generation
 */
export interface CertificateInfo {
    alias: string;
    keyPassword: string;
    storePassword: string;
    validity: number; // days
    cn: string;  // Common Name (Your Name)
    ou: string;  // Organizational Unit
    o: string;   // Organization
    l: string;   // City/Locality
    st: string;  // State/Province
    c: string;   // Country Code (2 letters)
}

/**
 * Keystore configuration saved in workspace
 */
export interface KeystoreConfig {
    keystorePath: string;
    keyAlias: string;
    // Passwords are stored separately in VS Code's SecretStorage
}

/**
 * Manages Android keystore creation and signing operations.
 * Uses keytool from JDK to generate keystores.
 */
export class KeystoreManager {
    private readonly KEYSTORE_CONFIG_KEY = 'android.signing.keystore';
    private readonly STORE_PASSWORD_KEY = 'android.signing.storePassword';
    private readonly KEY_PASSWORD_KEY = 'android.signing.keyPassword';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Find keytool executable from JAVA_HOME or common JDK locations
     */
    async getKeytoolPath(): Promise<string> {
        const isWindows = os.platform() === 'win32';
        const keytoolName = isWindows ? 'keytool.exe' : 'keytool';

        // 1. Try JAVA_HOME environment variable
        const javaHome = process.env.JAVA_HOME;
        if (javaHome) {
            const keytoolPath = path.join(javaHome, 'bin', keytoolName);
            if (fs.existsSync(keytoolPath)) {
                return keytoolPath;
            }
        }

        // 2. Try to find from PATH (keytool might be in PATH)
        try {
            const { stdout } = await execAsync(isWindows ? 'where keytool' : 'which keytool');
            const foundPath = stdout.trim().split('\n')[0];
            if (foundPath && fs.existsSync(foundPath)) {
                return foundPath;
            }
        } catch {
            // Not in PATH, continue searching
        }

        // 3. Common JDK installation paths
        const commonPaths = this.getCommonJDKPaths();
        for (const jdkPath of commonPaths) {
            const keytoolPath = path.join(jdkPath, 'bin', keytoolName);
            if (fs.existsSync(keytoolPath)) {
                return keytoolPath;
            }
        }

        throw new Error(
            'keytool not found!\n\n' +
            'Please ensure JDK is installed and either:\n' +
            '• Set JAVA_HOME environment variable\n' +
            '• Add JDK bin folder to PATH'
        );
    }

    /**
     * Get common JDK installation paths
     */
    private getCommonJDKPaths(): string[] {
        const platform = os.platform();
        const homeDir = os.homedir();

        if (platform === 'win32') {
            return [
                // Android Studio embedded JDK
                path.join(homeDir, 'AppData', 'Local', 'Android', 'Sdk', 'jbr'),
                // Common Oracle/OpenJDK locations
                'C:\\Program Files\\Java\\jdk-21',
                'C:\\Program Files\\Java\\jdk-17',
                'C:\\Program Files\\Java\\jdk-11',
                'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
                'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
                'C:\\Program Files\\Microsoft\\jdk-17',
            ];
        } else if (platform === 'darwin') {
            return [
                '/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home',
                '/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home',
                path.join(homeDir, 'Library', 'Android', 'sdk', 'jbr'),
            ];
        } else {
            return [
                '/usr/lib/jvm/java-21-openjdk',
                '/usr/lib/jvm/java-17-openjdk',
                '/usr/lib/jvm/default-java',
            ];
        }
    }

    /**
     * Create a new keystore with user wizard
     */
    async createKeystore(): Promise<string | null> {
        // Step 1: Ask for keystore file location
        const saveUri = await vscode.window.showSaveDialog({
            title: 'Save Keystore As',
            defaultUri: vscode.Uri.file(
                path.join(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir(),
                    'release-key.jks'
                )
            ),
            filters: {
                'Java Keystore': ['jks', 'keystore'],
            }
        });

        if (!saveUri) {
            return null;
        }

        const keystorePath = saveUri.fsPath;

        // Step 2: Collect certificate information
        const certInfo = await this.collectCertificateInfo();
        if (!certInfo) {
            return null;
        }

        // Step 3: Generate keystore using keytool
        try {
            await this.generateKeystore(keystorePath, certInfo);
            
            // Step 4: Save configuration
            await this.saveKeystoreConfig({
                keystorePath,
                keyAlias: certInfo.alias
            });
            await this.savePasswords(certInfo.storePassword, certInfo.keyPassword);

            vscode.window.showInformationMessage(
                `✅ Keystore created successfully!\n\n` +
                `📁 Location: ${keystorePath}\n` +
                `🔑 Alias: ${certInfo.alias}\n\n` +
                `⚠️ Keep your passwords safe! They are stored securely in VS Code.`
            );

            return keystorePath;

        } catch (error: any) {
            vscode.window.showErrorMessage(`❌ Failed to create keystore: ${error.message}`);
            return null;
        }
    }

    /**
     * Collect certificate information from user
     */
    private async collectCertificateInfo(): Promise<CertificateInfo | null> {
        // Key Alias
        const alias = await vscode.window.showInputBox({
            title: 'Key Alias (1/8)',
            prompt: 'Enter a unique name for this key',
            value: 'release-key',
            validateInput: v => v.trim() ? null : 'Alias is required'
        });
        if (!alias) return null;

        // Store Password
        const storePassword = await vscode.window.showInputBox({
            title: 'Keystore Password (2/8)',
            prompt: 'Enter password for the keystore (min 6 characters)',
            password: true,
            validateInput: v => v.length >= 6 ? null : 'Password must be at least 6 characters'
        });
        if (!storePassword) return null;

        // Confirm Store Password
        const storePasswordConfirm = await vscode.window.showInputBox({
            title: 'Confirm Keystore Password (3/8)',
            prompt: 'Re-enter the keystore password',
            password: true,
            validateInput: v => v === storePassword ? null : 'Passwords do not match'
        });
        if (!storePasswordConfirm) return null;

        // Key Password (can be same as store password)
        const usesSamePassword = await vscode.window.showQuickPick(
            [
                { label: 'Yes', description: 'Use same password for key', value: true },
                { label: 'No', description: 'Set different password for key', value: false }
            ],
            { title: 'Key Password (4/8)', placeHolder: 'Use same password as keystore?' }
        );
        if (!usesSamePassword) return null;

        let keyPassword = storePassword;
        if (!usesSamePassword.value) {
            const customKeyPassword = await vscode.window.showInputBox({
                title: 'Key Password',
                prompt: 'Enter password for the key (min 6 characters)',
                password: true,
                validateInput: v => v.length >= 6 ? null : 'Password must be at least 6 characters'
            });
            if (!customKeyPassword) return null;
            keyPassword = customKeyPassword;
        }

        // Common Name (Your Name)
        const cn = await vscode.window.showInputBox({
            title: 'Your Name (5/8)',
            prompt: 'Enter your name or organization name',
            value: 'Developer',
            validateInput: v => v.trim() ? null : 'Name is required'
        });
        if (!cn) return null;

        // Organization
        const o = await vscode.window.showInputBox({
            title: 'Organization (6/8)',
            prompt: 'Enter your company or organization name (optional)',
            value: ''
        }) || '';

        // City
        const l = await vscode.window.showInputBox({
            title: 'City (7/8)',
            prompt: 'Enter your city (optional)',
            value: ''
        }) || '';

        // Country Code
        const c = await vscode.window.showInputBox({
            title: 'Country Code (8/8)',
            prompt: 'Enter 2-letter country code (e.g., US, EG, SA)',
            value: '',
            validateInput: v => !v || /^[A-Za-z]{2}$/.test(v) ? null : 'Must be 2 letters'
        }) || '';

        return {
            alias,
            storePassword,
            keyPassword,
            validity: 10000, // ~27 years
            cn,
            ou: '', // Optional: Organizational Unit
            o,
            l,
            st: '', // Optional: State
            c
        };
    }

    /**
     * Generate keystore using keytool command
     */
    private async generateKeystore(keystorePath: string, cert: CertificateInfo): Promise<void> {
        const keytool = await this.getKeytoolPath();

        // Build Distinguished Name (DN)
        const dnParts: string[] = [];
        if (cert.cn) dnParts.push(`CN=${cert.cn}`);
        if (cert.ou) dnParts.push(`OU=${cert.ou}`);
        if (cert.o) dnParts.push(`O=${cert.o}`);
        if (cert.l) dnParts.push(`L=${cert.l}`);
        if (cert.st) dnParts.push(`ST=${cert.st}`);
        if (cert.c) dnParts.push(`C=${cert.c}`);
        const dname = dnParts.join(', ');

        // Build keytool command
        const command = [
            `"${keytool}"`,
            '-genkeypair',
            '-v',
            `-keystore "${keystorePath}"`,
            `-alias "${cert.alias}"`,
            `-keyalg RSA`,
            `-keysize 2048`,
            `-validity ${cert.validity}`,
            `-storepass "${cert.storePassword}"`,
            `-keypass "${cert.keyPassword}"`,
            `-dname "${dname}"`
        ].join(' ');

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔐 Generating keystore...',
            cancellable: false
        }, async () => {
            await execAsync(command);
        });
    }

    /**
     * Save keystore configuration to workspace state
     */
    async saveKeystoreConfig(config: KeystoreConfig): Promise<void> {
        await this.context.workspaceState.update(this.KEYSTORE_CONFIG_KEY, config);
    }

    /**
     * Load keystore configuration from workspace state
     */
    getKeystoreConfig(): KeystoreConfig | undefined {
        return this.context.workspaceState.get<KeystoreConfig>(this.KEYSTORE_CONFIG_KEY);
    }

    /**
     * Save passwords securely using VS Code's SecretStorage
     */
    async savePasswords(storePassword: string, keyPassword: string): Promise<void> {
        await this.context.secrets.store(this.STORE_PASSWORD_KEY, storePassword);
        await this.context.secrets.store(this.KEY_PASSWORD_KEY, keyPassword);
    }

    /**
     * Get saved passwords from SecretStorage
     */
    async getPasswords(): Promise<{ storePassword: string; keyPassword: string } | null> {
        const storePassword = await this.context.secrets.get(this.STORE_PASSWORD_KEY);
        const keyPassword = await this.context.secrets.get(this.KEY_PASSWORD_KEY);
        
        if (!storePassword || !keyPassword) {
            return null;
        }

        return { storePassword, keyPassword };
    }

    /**
     * Check if signing is configured for this workspace
     */
    isSigningConfigured(): boolean {
        const config = this.getKeystoreConfig();
        return !!config && fs.existsSync(config.keystorePath);
    }

    /**
     * Clear saved signing configuration
     */
    async clearSigningConfig(): Promise<void> {
        await this.context.workspaceState.update(this.KEYSTORE_CONFIG_KEY, undefined);
        await this.context.secrets.delete(this.STORE_PASSWORD_KEY);
        await this.context.secrets.delete(this.KEY_PASSWORD_KEY);
    }

    /**
     * Select existing keystore file
     */
    async selectExistingKeystore(): Promise<string | null> {
        const uri = await vscode.window.showOpenDialog({
            title: 'Select Keystore File',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Java Keystore': ['jks', 'keystore'],
                'All Files': ['*']
            }
        });

        if (!uri || !uri[0]) {
            return null;
        }

        const keystorePath = uri[0].fsPath;

        // Ask for alias
        const alias = await vscode.window.showInputBox({
            title: 'Key Alias',
            prompt: 'Enter the key alias used in this keystore',
            validateInput: v => v.trim() ? null : 'Alias is required'
        });

        if (!alias) {
            return null;
        }

        // Ask for store password
        const storePassword = await vscode.window.showInputBox({
            title: 'Keystore Password',
            prompt: 'Enter the keystore password',
            password: true,
            validateInput: v => v ? null : 'Password is required'
        });

        if (!storePassword) {
            return null;
        }

        // Ask for key password
        const keyPassword = await vscode.window.showInputBox({
            title: 'Key Password',
            prompt: 'Enter the key password (or leave empty if same as keystore password)',
            password: true
        });

        // Save configuration
        await this.saveKeystoreConfig({ keystorePath, keyAlias: alias });
        await this.savePasswords(storePassword, keyPassword || storePassword);

        vscode.window.showInformationMessage(`✅ Keystore configured: ${path.basename(keystorePath)}`);

        return keystorePath;
    }
}
