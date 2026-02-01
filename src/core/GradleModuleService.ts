import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GradleModuleService {
    
    /**
     * Parse settings.gradle to extract all included modules
     * @param projectRoot The root directory of the Android project
     */
    async getModules(projectRoot: string): Promise<string[]> {
        const settingsPath = this.getSettingsGradlePath(projectRoot);
        if (!settingsPath) {
            return [];
        }

        try {
            const content = fs.readFileSync(settingsPath, 'utf8');
            return this.parseModules(content);
        } catch (error) {
            console.error('Failed to parse settings.gradle:', error);
            return [];
        }
    }

    /**
     * Find settings.gradle or settings.gradle.kts
     */
    private getSettingsGradlePath(projectRoot: string): string | null {
        const groovyPath = path.join(projectRoot, 'settings.gradle');
        const ktsPath = path.join(projectRoot, 'settings.gradle.kts');

        if (fs.existsSync(groovyPath)) return groovyPath;
        if (fs.existsSync(ktsPath)) return ktsPath;
        return null;
    }

    /**
     * Extract module names using Regex
     * Supports: 
     * include ':app'
     * include ":app"
     * include(":app")
     * include ':app', ':lib'
     */
    private parseModules(content: string): string[] {
        const modules: string[] = ['(Project Root)']; // Default option to build everything
        
        // Regex to find any module declaration (strings starting with :)
        const regex = /['"](:[^'"]+)['"]/g;
        
        let match;
        while ((match = regex.exec(content)) !== null) {
            const moduleName = match[1];
            // Filter out obviously non-module strings if any (valid module starts with :)
            if (moduleName.startsWith(':') && !modules.includes(moduleName)) {
                modules.push(moduleName);
            }
        }

        return modules.sort();
    }
}
