const { Plugin, TFolder, TFile } = require('obsidian');

class NumberedFoldersPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.INDEX_FILE_NAME = 'Numbered Folders Index.md';
    }
    
    async onload() {
        console.log('Loading Numbered Folders Plugin');
        
        // Generate initial index
        await this.generateIndex();
        
        // Register event listeners to keep index updated
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (file instanceof TFolder && this.isNumberedFolder(file)) {
                    await this.generateIndex();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (file instanceof TFolder && this.isNumberedFolder(file)) {
                    await this.generateIndex();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFolder) {
                    const wasNumbered = this.isNumberedFolderPath(oldPath);
                    const isNumbered = this.isNumberedFolder(file);
                    
                    if (wasNumbered || isNumbered) {
                        await this.generateIndex();
                    }
                }
            })
        );
        
        // Add command to manually regenerate index
        this.addCommand({
            id: 'regenerate-numbered-folders-index',
            name: 'Regenerate numbered folders index',
            callback: async () => {
                await this.generateIndex();
                console.log('Manual regeneration completed');
            }
        });
    }
    
    /**
     * Check if a folder should be included based on naming pattern
     */
    isNumberedFolder(folder) {
        return this.isNumberedFolderPath(folder.path);
    }
    
    /**
     * Check if a folder path matches the numbered pattern
     */
    isNumberedFolderPath(path) {
        const folderName = path.split('/').pop() || '';
        
        // Include folders starting with numbers, but exclude folders starting with years (19xx or 20xx)
        return /^\d/.test(folderName) && !/^(19|20)\d{2}/.test(folderName);
    }
    
    /**
     * Get all numbered folders in the vault with their full paths
     */
    getNumberedFolders() {
        const folders = [];
        
        const processFolder = (folder) => {
            if (this.isNumberedFolder(folder)) {
                folders.push(folder.path);
            }
            
            // Recursively check subfolders
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    processFolder(child);
                }
            }
        };
        
        // Start from root
        for (const item of this.app.vault.getRoot().children) {
            if (item instanceof TFolder) {
                processFolder(item);
            }
        }
        
        return folders.sort();
    }
    
    /**
     * Check if folder note exists (inside the folder, not as sibling)
     */
    getFolderNotePath(folderPath) {
        const folderName = folderPath.split('/').pop();
        const folderNotePath = `${folderPath}/${folderName}.md`;
        
        // Check if the folder note exists
        const folderNote = this.app.vault.getAbstractFileByPath(folderNotePath);
        return folderNote ? folderNotePath : null;
    }
    
    /**
     * Build nested folder tree structure
     */
    buildFolderTree(folders) {
        const tree = {};
        
        folders.forEach(folderPath => {
            const parts = folderPath.split('/');
            let current = tree;
            
            parts.forEach((part, index) => {
                // Only process parts that start with numbers, but exclude pure year folders
                if (/^\d/.test(part) && !/^\d{4}$/.test(part)) {
                    if (!current[part]) {
                        const currentPath = parts.slice(0, index + 1).join('/');
                        const folderNotePath = this.getFolderNotePath(currentPath);
                        
                        current[part] = {
                            path: currentPath,
                            folderNote: folderNotePath,
                            children: {}
                        };
                    }
                    current = current[part].children;
                }
            });
        });
        
        return tree;
    }
    
    /**
     * Render the tree with proper indentation
     */
    renderTree(tree, level = 0) {
        const indent = "  ".repeat(level);
        let output = "";
        
        // Sort entries by numerical prefix
        const sortedEntries = Object.entries(tree).sort((a, b) => {
            const getNumericParts = (name) => {
                const match = name.match(/^(\d+(?:\.\d+)*)/);
                return match ? match[1].split('.').map(Number) : [0];
            };
            
            const aParts = getNumericParts(a[0]);
            const bParts = getNumericParts(b[0]);
            
            // Compare numeric parts properly
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aVal = aParts[i] || 0;
                const bVal = bParts[i] || 0;
                if (aVal !== bVal) {
                    return aVal - bVal;
                }
            }
            
            return 0;
        });
        
        sortedEntries.forEach(([folderName, data]) => {
            if (data.folderNote) {
                // Link to folder note if it exists
                output += `${indent}- [[${data.folderNote}|${folderName}]]\n`;
            } else {
                // Just show folder name as plain text if no folder note exists
                output += `${indent}- ${folderName}\n`;
            }
            
            if (Object.keys(data.children).length > 0) {
                output += this.renderTree(data.children, level + 1);
            }
        });
        
        return output;
    }
    
    /**
     * Generate the index content with nested structure
     */
    generateIndexContent() {
        const folders = this.getNumberedFolders();
        
        if (folders.length === 0) {
            return '# Numbered Folders Index\n\nNo numbered folders found in the vault.\n\nFolders should be named similar to: 01 - Collections and 01.01 - Topics etc…';
        }
        
        let content = ''; //'# Numbered Folders Index\n';
        //content += `*Auto-generated hierarchical index of ${folders.length} numbered folders*\n\n`;
        
        // Build and render the nested tree
        const folderTree = this.buildFolderTree(folders);
        content += this.renderTree(folderTree);
        
        content += `\n---\n*Last updated: ${new Date().toLocaleString()}*\n`;
        
        return content;
    }
    
    /**
     * Generate or update the index file
     */
    async generateIndex() {
        try {
            const content = this.generateIndexContent();
            const existingFile = this.app.vault.getAbstractFileByPath(this.INDEX_FILE_NAME);
            
            if (existingFile instanceof TFile) {
                // Update existing file
                await this.app.vault.modify(existingFile, content);
            } else {
                // Create new file
                await this.app.vault.create(this.INDEX_FILE_NAME, content);
            }
            
            console.log('Numbered folders index updated');
        } catch (error) {
            console.error('Error generating numbered folders index:', error);
        }
    }
    
    onunload() {
        console.log('Unloading Numbered Folders Plugin');
    }
}

module.exports = NumberedFoldersPlugin;