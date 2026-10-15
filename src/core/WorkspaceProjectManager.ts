import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface AndroidProject {
    /** Project display name */
    name: string;
    /** Absolute path to the directory containing settings.gradle or build.gradle */
    projectRoot: string;
    /** The parent VS Code WorkspaceFolder */
    workspaceFolder: vscode.WorkspaceFolder;
    /** Relative path from workspace folder root (empty string if at root) */
    relativePath: string;
}

/**
 * Manages discovery, selection, and persistence of Android projects
 * across single-folder and multi-root VS Code workspaces.
 */
export class WorkspaceProjectManager implements vscode.Disposable {
    private static instance?: WorkspaceProjectManager;

    private detectedProjects: AndroidProject[] = [];
    private activeProject?: AndroidProject;
    private disposables: vscode.Disposable[] = [];

    private _onDidChangeActiveProject = new vscode.EventEmitter<AndroidProject>();
    public readonly onDidChangeActiveProject: vscode.Event<AndroidProject> = this._onDidChangeActiveProject.event;

    private _onDidChangeProjects = new vscode.EventEmitter<AndroidProject[]>();
    public readonly onDidChangeProjects: vscode.Event<AndroidProject[]> = this._onDidChangeProjects.event;

    constructor(private context: vscode.ExtensionContext) {
        WorkspaceProjectManager.instance = this;

        // Listen for workspace folders changes (e.g. user adds or removes a folder)
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.rescanProjects();
            })
        );
    }

    public static getInstance(): WorkspaceProjectManager | undefined {
        return WorkspaceProjectManager.instance;
    }

    /**
     * Initialize discovery and restore previously selected project
     */
    public async initialize(): Promise<void> {
        await this.rescanProjects();
    }

    /**
     * Rescan all workspace folders to find all Android/Gradle projects
     */
    public async rescanProjects(): Promise<AndroidProject[]> {
        const folders = vscode.workspace.workspaceFolders || [];
        const projects: AndroidProject[] = [];

        for (const folder of folders) {
            const folderPath = folder.uri.fsPath;

            // 1. Check if folder root itself is an Android project
            if (this.isAndroidRoot(folderPath)) {
                projects.push({
                    name: folder.name,
                    projectRoot: folderPath,
                    workspaceFolder: folder,
                    relativePath: ''
                });
                continue;
            }

            // 2. Check immediate subdirectories (e.g. monorepo, android/ subfolder in hybrid apps)
            try {
                if (fs.existsSync(folderPath)) {
                    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'build') {
                            const subDirPath = path.join(folderPath, entry.name);
                            if (this.isAndroidRoot(subDirPath)) {
                                projects.push({
                                    name: `${folder.name}/${entry.name}`,
                                    projectRoot: subDirPath,
                                    workspaceFolder: folder,
                                    relativePath: entry.name
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`[WorkspaceProjectManager] Error scanning ${folderPath}:`, err);
            }
        }

        this.detectedProjects = projects;

        // Set VS Code context for conditional UI elements (like toolbar buttons)
        vscode.commands.executeCommand('setContext', 'android:hasMultipleProjects', projects.length > 1);

        // Determine active project
        const savedRoot = this.context.workspaceState.get<string>('android-studio-flash.activeProjectRoot');
        let matched = projects.find(p => p.projectRoot === savedRoot);

        if (!matched && projects.length > 0) {
            // Default to first detected project
            matched = projects[0];
        }

        this.activeProject = matched;
        this._onDidChangeProjects.fire(this.detectedProjects);

        if (this.activeProject) {
            this._onDidChangeActiveProject.fire(this.activeProject);
        }

        return this.detectedProjects;
    }

    /**
     * Get all detected Android projects
     */
    public getProjects(): AndroidProject[] {
        return this.detectedProjects;
    }

    /**
     * Get the currently active Android project
     */
    public getActiveProject(): AndroidProject | undefined {
        return this.activeProject;
    }

    /**
     * Get the root path of the active Android project.
     * Falls back to first workspace folder if no project was explicitly detected.
     */
    public getActiveProjectRoot(): string | undefined {
        if (this.activeProject) {
            return this.activeProject.projectRoot;
        }

        const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return firstFolder;
    }

    /**
     * Set the active project and persist selection
     */
    public async setActiveProject(projectOrPath: AndroidProject | string): Promise<void> {
        let target: AndroidProject | undefined;
        if (typeof projectOrPath === 'string') {
            target = this.detectedProjects.find(p => p.projectRoot === projectOrPath);
        } else {
            target = projectOrPath;
        }

        if (target && target.projectRoot !== this.activeProject?.projectRoot) {
            this.activeProject = target;
            await this.context.workspaceState.update('android-studio-flash.activeProjectRoot', target.projectRoot);
            this._onDidChangeActiveProject.fire(target);
        }
    }

    /**
     * Check if a directory is an Android/Gradle root
     */
    private isAndroidRoot(dirPath: string): boolean {
        try {
            const hasSettings = fs.existsSync(path.join(dirPath, 'settings.gradle')) ||
                                fs.existsSync(path.join(dirPath, 'settings.gradle.kts'));

            const hasBuild = fs.existsSync(path.join(dirPath, 'build.gradle')) ||
                             fs.existsSync(path.join(dirPath, 'build.gradle.kts'));

            const hasWrapper = fs.existsSync(path.join(dirPath, 'gradlew')) ||
                               fs.existsSync(path.join(dirPath, 'gradlew.bat'));

            const hasAppModule = fs.existsSync(path.join(dirPath, 'app', 'build.gradle')) ||
                                 fs.existsSync(path.join(dirPath, 'app', 'build.gradle.kts'));

            // If it has settings.gradle OR (build.gradle AND (wrapper OR app module))
            return hasSettings || (hasBuild && (hasWrapper || hasAppModule));
        } catch {
            return false;
        }
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeActiveProject.dispose();
        this._onDidChangeProjects.dispose();
    }
}
