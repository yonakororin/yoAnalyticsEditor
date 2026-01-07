import { Node } from './Node.js';
import { API_URL } from '../Config.js';
import { SchemaModal, FileExplorerModal } from '../ui/Modal.js';

export class FileNode extends Node {
    constructor(x, y) {
        super(x, y, 'File Source');
        this.addOutput();
        this.currentPath = '';
        this.selectedFiles = [];
        this.hasHeader = true;
    }

    async init() {
        this.renderExplorer('');
    }

    async renderExplorer(path) {
        this.currentPath = path;
        this.selectedFile = '';
        this.content.innerHTML = '<div style="opacity:0.5">Loading...</div>';

        try {
            const res = await fetch(API_URL + `?action=list_files&path=${encodeURIComponent(path)}`);
            const json = await res.json();

            this.content.innerHTML = '';

            // Breadcrumb / Up
            const nav = document.createElement('div');
            nav.style.marginBottom = '5px';
            nav.style.fontSize = '0.8em';
            nav.innerHTML = `Path: ${json.current || '/'} `;
            if (json.current) {
                const upBtn = document.createElement('span');
                upBtn.innerHTML = '⬆️';
                upBtn.style.cursor = 'pointer';
                upBtn.onclick = () => {
                    const parts = json.current.split('/');
                    parts.pop();
                    this.renderExplorer(parts.join('/'));
                };
                nav.appendChild(upBtn);
            }
            this.content.appendChild(nav);

            // List
            const list = document.createElement('div');
            list.style.flex = '1';
            list.style.minHeight = '100px';
            list.style.overflowY = 'auto';
            list.style.border = '1px solid var(--node-border)';
            list.style.background = 'rgba(0,0,0,0.2)';

            json.items.forEach(item => {
                const row = document.createElement('div');
                row.style.padding = '2px 5px';
                row.style.cursor = 'pointer';
                row.style.fontSize = '0.9em';

                if (item.type === 'dir') {
                    row.innerHTML = `📁 ${item.name}`;
                    row.onclick = () => this.renderExplorer(item.path);
                } else {
                    row.innerHTML = `📄 ${item.name}`;
                    row.dataset.path = item.path;
                    row.onclick = (e) => {
                        const path = item.path;
                        if (e.ctrlKey || e.metaKey) {
                            if (this.selectedFiles.includes(path)) {
                                this.selectedFiles = this.selectedFiles.filter(p => p !== path);
                            } else {
                                this.selectedFiles.push(path);
                            }
                        } else {
                            this.selectedFiles = [path];
                        }

                        // Visual selection update
                        Array.from(list.children).forEach(c => {
                            if (c.dataset.path && this.selectedFiles.includes(c.dataset.path)) {
                                c.style.background = 'rgba(56, 189, 248, 0.3)';
                            } else {
                                c.style.background = '';
                            }
                        });
                        this.updateOutput();
                    };
                    // Initial state
                    if (this.selectedFiles.includes(item.path)) {
                        row.style.background = 'rgba(56, 189, 248, 0.3)';
                    }
                }
                list.appendChild(row);
            });
            this.content.appendChild(list);

            // Header Checkbox
            const checkContainer = document.createElement('div');
            checkContainer.style.marginTop = '10px';
            checkContainer.innerHTML = `
                <label style="font-size:0.9em; display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" id="header-check" ${this.hasHeader ? 'checked' : ''} style="width:auto; margin-right:5px;">
                    First row is header
                </label>
            `;
            checkContainer.querySelector('input').onchange = (e) => {
                this.hasHeader = e.target.checked;
            };
            this.content.appendChild(checkContainer);


            // Index Input
            const indexContainer = document.createElement('div');
            indexContainer.style.marginTop = '5px';
            indexContainer.innerHTML = `
                <input type="text" class="index-input" placeholder="Index Col (Opt)" style="font-size:0.9em; padding:4px; width:100%; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; border-radius:3px;">
            `;
            this.content.appendChild(indexContainer);

            // Load Button
            const btn = document.createElement('button');
            btn.className = 'run-btn';
            btn.style.marginTop = '5px';
            btn.innerText = 'Load File';
            btn.onclick = () => this.importFile();
            this.content.appendChild(btn);

        } catch (e) {
            this.content.innerHTML = 'Error listing files';
        }
    }

    async importFile() {
        if (this.selectedFiles.length === 0) {
            alert('Select file(s) first');
            return;
        }

        const btn = this.content.querySelector('.run-btn');
        const indexInput = this.content.querySelector('.index-input'); // Retrieve input
        const indexCol = indexInput ? indexInput.value : '';

        if (btn) btn.innerText = 'Importing...';

        try {
            const res = await fetch(API_URL + '?action=import_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paths: this.selectedFiles,
                    has_header: this.hasHeader,
                    index_column: indexCol
                })
            });
            const json = await res.json();

            if (json.error) throw new Error(json.error);

            this.data = { tableName: json.table };
            this.header.style.background = 'rgba(56, 189, 248, 0.4)';
            setTimeout(() => this.header.style.background = '', 1000);
            this.triggerDownstreamUpdates();

            if (btn) btn.innerText = 'Reload File';

            if (!this.content.querySelector('.view-schema-btn')) {
                const vsBtn = document.createElement('button');
                vsBtn.className = 'view-schema-btn';
                vsBtn.style.marginTop = '5px';
                vsBtn.style.fontSize = '0.8em';
                vsBtn.style.padding = '2px 5px';
                vsBtn.style.background = 'transparent';
                vsBtn.style.border = '1px solid #666';
                vsBtn.style.color = '#ccc';
                vsBtn.style.cursor = 'pointer';
                vsBtn.innerText = 'View Schema';
                vsBtn.onclick = () => new SchemaModal(this.data.tableName);
                this.content.appendChild(vsBtn);
            }
            this.updateOutput();

        } catch (e) {
            alert(e.message);
            if (btn) btn.innerText = 'Load File';
        }
    }

    updateOutput() {
        // Update Info Display
        if (!this.infoDiv) {
            this.infoDiv = document.createElement('div');
            this.infoDiv.style.marginTop = '10px';
            this.infoDiv.style.fontSize = '0.8em';
            this.infoDiv.style.color = '#aaa';
            this.infoDiv.style.borderTop = '1px solid #444';
            this.infoDiv.style.paddingTop = '5px';
            this.content.appendChild(this.infoDiv);
        }
        if (this.selectedFiles.length > 0) {
            if (this.selectedFiles.length === 1) {
                const name = this.selectedFiles[0].split('/').pop();
                this.infoDiv.innerText = 'Selected: ' + name;
            } else {
                this.infoDiv.innerText = `Selected: ${this.selectedFiles.length} files`;
            }
            this.infoDiv.title = this.selectedFiles.join('\n');
        } else {
            this.infoDiv.innerText = 'No file selected';
        }
    }

    getDescription(stepMap, connections) {
        let desc = `- **アクション**: ファイルをロード\n`;
        const count = this.selectedFiles ? this.selectedFiles.length : 0;
        if (count === 1) {
            desc += `- **ファイルパス**: \`${this.selectedFiles[0] || '未選択'}\`\n`;
        } else if (count > 1) {
            desc += `- **ファイルパス**: ${count} files selected\n`;
            // Optional: list them if few?
        } else {
            desc += `- **ファイルパス**: 未選択\n`;
        }
        desc += `- **設定**: ${this.hasHeader ? 'ヘッダーあり' : 'ヘッダーなし'}\n`;
        return desc;
    }

    async run() {
        if (!this.data || !this.data.tableName) {
            if (this.selectedFiles.length > 0) {
                await this.importFile();
            }
        }
    }
}
