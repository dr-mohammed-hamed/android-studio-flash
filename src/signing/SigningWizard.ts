import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { KeystoreManager, KeystoreConfig } from './KeystoreManager';

/**
 * Result of signing wizard
 */
export interface SigningResult {
    shouldProceed: boolean;
    signingMode: 'signed' | 'unsigned';
    keystoreConfig?: KeystoreConfig;
    storePassword?: string;
    keyPassword?: string;
}

/**
 * Smart wizard that guides users through the release signing process.
 * Checks if signing is configured and offers options accordingly.
 */
export class SigningWizard {
    constructor(private keystoreManager: KeystoreManager) {}

    /**
     * Run the signing wizard before building release APK
     * Returns signing configuration or null if cancelled
     */
    async run(): Promise<SigningResult | null> {
        // Check if signing is already configured in workspace
        if (this.keystoreManager.isSigningConfigured()) {
            return await this.handleExistingConfig();
        }

        // Check if build.gradle has signing config
        const hasGradleSigning = await this.checkGradleSigningConfig();
        if (hasGradleSigning) {
            // Gradle handles signing, just proceed
            return {
                shouldProceed: true,
                signingMode: 'signed'
            };
        }

        // No signing configured - show wizard
        return await this.showSigningOptions();
    }

    /**
     * Handle when signing is already configured in workspace
     */
    private async handleExistingConfig(): Promise<SigningResult | null> {
        const config = this.keystoreManager.getKeystoreConfig()!;
        const passwords = await this.keystoreManager.getPasswords();

        if (!passwords) {
            // Passwords lost, need to re-enter
            const storePassword = await vscode.window.showInputBox({
                title: 'Keystore Password',
                prompt: `Enter password for ${path.basename(config.keystorePath)}`,
                password: true
            });

            if (!storePassword) return null;

            const keyPassword = await vscode.window.showInputBox({
                title: 'Key Password',
                prompt: 'Enter key password (or leave empty if same)',
                password: true
            });

            await this.keystoreManager.savePasswords(storePassword, keyPassword || storePassword);

            return {
                shouldProceed: true,
                signingMode: 'signed',
                keystoreConfig: config,
                storePassword,
                keyPassword: keyPassword || storePassword
            };
        }

        // Config exists and passwords available
        const action = await vscode.window.showQuickPick([
            {
                label: '$(check) Use saved signing config',
                description: path.basename(config.keystorePath),
                value: 'use' as const
            },
            {
                label: '$(gear) Change signing config',
                description: 'Select different keystore',
                value: 'change' as const
            },
            {
                label: '$(x) Build unsigned',
                description: 'Build without signing',
                value: 'unsigned' as const
            }
        ], {
            title: 'Release Signing',
            placeHolder: 'How would you like to sign the release APK?'
        });

        if (!action) return null;

        switch (action.value) {
            case 'use':
                return {
                    shouldProceed: true,
                    signingMode: 'signed',
                    keystoreConfig: config,
                    storePassword: passwords.storePassword,
                    keyPassword: passwords.keyPassword
                };

            case 'change':
                await this.keystoreManager.clearSigningConfig();
                return await this.showSigningOptions();

            case 'unsigned':
                return {
                    shouldProceed: true,
                    signingMode: 'unsigned'
                };
        }

        return null;
    }

    /**
     * Show signing options when no config exists
     */
    private async showSigningOptions(): Promise<SigningResult | null> {
        const choice = await vscode.window.showQuickPick([
            {
                label: '$(key) Create New Keystore',
                description: 'Generate a new signing key (recommended for new apps)',
                value: 'create' as const
            },
            {
                label: '$(folder-opened) Use Existing Keystore',
                description: 'Select a keystore file you already have',
                value: 'existing' as const
            },
            {
                label: '$(package) Build Unsigned APK',
                description: 'Skip signing (cannot be installed on most devices)',
                value: 'unsigned' as const
            }
        ], {
            title: '🔐 Release Signing Required',
            placeHolder: 'Release APKs must be signed. Choose an option:'
        });

        if (!choice) return null;

        switch (choice.value) {
            case 'create':
                const created = await this.keystoreManager.createKeystore();
                if (!created) return null;
                
                const passwords = await this.keystoreManager.getPasswords();
                const config = this.keystoreManager.getKeystoreConfig();
                
                return {
                    shouldProceed: true,
                    signingMode: 'signed',
                    keystoreConfig: config,
                    storePassword: passwords?.storePassword,
                    keyPassword: passwords?.keyPassword
                };

            case 'existing':
                const selected = await this.keystoreManager.selectExistingKeystore();
                if (!selected) return null;
                
                const existingPasswords = await this.keystoreManager.getPasswords();
                const existingConfig = this.keystoreManager.getKeystoreConfig();
                
                return {
                    shouldProceed: true,
                    signingMode: 'signed',
                    keystoreConfig: existingConfig,
                    storePassword: existingPasswords?.storePassword,
                    keyPassword: existingPasswords?.keyPassword
                };

            case 'unsigned':
                const confirm = await vscode.window.showWarningMessage(
                    '⚠️ Unsigned APKs cannot be installed on most devices and cannot be uploaded to Play Store.',
                    { modal: true },
                    'Build Anyway',
                    'Cancel'
                );
                
                if (confirm !== 'Build Anyway') return null;
                
                return {
                    shouldProceed: true,
                    signingMode: 'unsigned'
                };
        }

        return null;
    }

    /**
     * Check if build.gradle already has signing configuration
     */
    private async checkGradleSigningConfig(): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return false;

        // Check app/build.gradle or app/build.gradle.kts
        const gradleFiles = [
            path.join(workspaceFolder.uri.fsPath, 'app', 'build.gradle'),
            path.join(workspaceFolder.uri.fsPath, 'app', 'build.gradle.kts')
        ];

        for (const gradleFile of gradleFiles) {
            if (fs.existsSync(gradleFile)) {
                try {
                    const content = fs.readFileSync(gradleFile, 'utf-8');
                    
                    // Look for signingConfigs block with release config
                    // This is a simple check - looks for signingConfigs containing release or signingConfig reference
                    if (content.includes('signingConfigs') && 
                        (content.includes('signingConfig') || content.includes('release {'))) {
                        
                        // Additional check: make sure it's actually configured (has storeFile)
                        if (content.includes('storeFile')) {
                            console.log('✅ Found signing config in build.gradle');
                            return true;
                        }
                    }
                } catch (error) {
                    console.error('Error reading build.gradle:', error);
                }
            }
        }

        return false;
    }
}
