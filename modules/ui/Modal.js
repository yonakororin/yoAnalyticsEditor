import { API_URL } from '../Config.js';

export class Autocomplete {
    constructor(textarea, strategy) {
        this.textarea = textarea;
        this.strategy = strategy;
        this.popup = document.createElement('div');
        this.popup.className = 'autocomplete-popup';
        this.popup.style.display = 'none';
        document.body.appendChild(this.popup);

        this.selectedIndex = 0;
        this.candidates = [];

        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('click', (e) => {
            if (e.target !== this.textarea && !this.popup.contains(e.target)) {
                this.hide();
            }
        });
    }

    async onInput() {
        const cursorPosition = this.textarea.selectionStart;
        const text = this.textarea.value;
        const wordMatch = this.getWordAt(text, cursorPosition);

        if (!wordMatch) {
            this.hide();
            return;
        }

        const query = wordMatch.word;
        if (query.length < 1) {
            this.hide();
            return;
        }

        this.candidates = await this.strategy.getCandidates(query);
        if (this.candidates.length > 0) {
            this.show(this.candidates, wordMatch.start, wordMatch.end);
        } else {
            this.hide();
        }
    }

    getWordAt(text, position) {
        let start = position;
        while (start > 0 && /[\w{}.]/.test(text[start - 1])) {
            start--;
        }

        let end = position;
        // while (end < text.length && /[\w{}.]/.test(text[end])) {
        //     end++;
        // }

        const word = text.substring(start, position);
        return { word, start, end };
    }

    show(candidates, start, end) {
        this.selectedIndex = 0;
        this.popup.innerHTML = '';
        const ul = document.createElement('ul');

        candidates.forEach((c, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${c.text}</span> <span class="type">${c.type}</span>`;
            li.addEventListener('click', () => this.select(c, start, end));
            if (index === 0) li.classList.add('selected');
            ul.appendChild(li);
        });

        this.popup.appendChild(ul);
        this.popup.style.display = 'block';

        const coords = this.getCaretCoordinates(this.textarea, start);
        const rect = this.textarea.getBoundingClientRect();

        this.popup.style.left = (rect.left + coords.left) + 'px';
        this.popup.style.top = (rect.top + coords.top + 20) + 'px';
    }

    hide() {
        this.popup.style.display = 'none';
        this.candidates = [];
    }

    onKeyDown(e) {
        if (this.popup.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % this.candidates.length;
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + this.candidates.length) % this.candidates.length;
            this.updateSelection();
        } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
            e.preventDefault();
            const wordMatch = this.getWordAt(this.textarea.value, this.textarea.selectionStart);
            if (wordMatch) {
                this.select(this.candidates[this.selectedIndex], wordMatch.start, wordMatch.end);
            }
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    updateSelection() {
        const items = this.popup.querySelectorAll('li');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    select(candidate, start, end) {
        const text = this.textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end);

        this.textarea.value = before + candidate.text + after;
        const newPos = start + candidate.text.length;
        this.textarea.setSelectionRange(newPos, newPos);

        this.hide();
        this.textarea.focus();
    }

    getCaretCoordinates(element, position) {
        const div = document.createElement('div');
        const style = window.getComputedStyle(element);

        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.width = element.clientWidth + 'px';
        div.style.font = style.font;
        div.style.padding = style.padding;
        div.style.border = style.border;
        div.style.overflow = 'hidden';

        div.textContent = element.value.substring(0, position);

        const span = document.createElement('span');
        span.textContent = element.value.substring(position) || '.';
        div.appendChild(span);

        document.body.appendChild(div);

        const coordinates = {
            top: span.offsetTop + parseInt(style.paddingTop),
            left: span.offsetLeft + parseInt(style.paddingLeft),
        };

        document.body.removeChild(div);
        return coordinates;
    }
}

export class FileExplorerModal {
    constructor(onSelect, mode = 'dir') {
        this.onSelect = onSelect;
        this.mode = mode;
        this.currentPath = '';
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        const title = mode === 'file' ? 'Select File' : 'Select Folder';
        const actionBtn = mode === 'file' ? '' : '<button class="select-btn" style="padding:5px 10px; background:#007acc; border:none; color:white;">Select This Folder</button>';

        this.overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <span>${title}</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="nav-bar" style="margin-bottom:10px; font-size:0.9em; opacity:0.8;"></div>
                    <div class="file-list"></div>
                </div>
                <div class="modal-footer">
                   <button class="cancel-btn" style="padding:5px 10px; background:transparent; border:1px solid #666; color:#eee;">Cancel</button>
                   ${actionBtn}
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.querySelector('.cancel-btn').onclick = () => this.close();
        if (mode === 'dir') {
            this.overlay.querySelector('.select-btn').onclick = () => this.selectCurrent();
        }
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this.close();
        };

        this.render('/');
    }

    async render(path) {
        this.currentPath = path;
        const nav = this.overlay.querySelector('.nav-bar');
        const list = this.overlay.querySelector('.file-list');

        nav.innerHTML = `Current: <b>${path || '/'}</b>`;
        list.innerHTML = 'Loading...';

        try {
            const res = await fetch(API_URL + `?action=list_files&path=${encodeURIComponent(path)}`);
            const json = await res.json();

            list.innerHTML = '';

            if (json.current) {
                const up = document.createElement('div');
                up.className = 'file-item';
                up.innerHTML = '📁 ..';
                up.onclick = () => {
                    const parts = json.current.split('/');
                    parts.pop();
                    this.render(parts.join('/'));
                };
                list.appendChild(up);
            }

            json.items.forEach(item => {
                if (item.type === 'dir') {
                    const row = document.createElement('div');
                    row.className = 'file-item';
                    row.innerHTML = `📁 ${item.name}`;
                    row.onclick = () => this.render(item.path);
                    list.appendChild(row);
                } else if (this.mode === 'file') {
                    const row = document.createElement('div');
                    row.className = 'file-item';
                    row.innerHTML = `📄 ${item.name}`;
                    row.onclick = () => {
                        if (this.onSelect) this.onSelect(item.path);
                        this.close();
                    };
                    list.appendChild(row);
                }
            });

        } catch (e) {
            list.innerHTML = 'Error loading contents';
        }
    }

    selectCurrent() {
        if (this.onSelect) {
            this.onSelect(this.currentPath);
        }
        this.close();
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class DbBrowserModal {
    constructor() {
        this.tablesData = [];
        this.currentDb = '';
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:900px; max-width:95vw;">
                <div class="modal-header">
                    <span>Database Browser</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body" style="display:flex; height:600px;">
                    <div style="width:300px; border-right:1px solid #444; padding-right:10px; display:flex; flex-direction:column;">
                        <select id="db-select" class="db-select" style="width:100%; padding:5px; background:#252526; color:#eee; border:1px solid #444; margin-bottom:10px;">
                            <option value="">Select Database...</option>
                        </select>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <button id="sort-create" class="db-browser-btn" style="flex:1; padding:2px;">Sort: Created</button>
                            <button id="sort-update" class="db-browser-btn" style="flex:1; padding:2px;">Sort: Updated</button>
                        </div>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <button id="delete-selected" class="db-browser-btn" style="flex:1; padding:2px; background:#a33;">Delete Selected</button>
                        </div>
                        <div id="table-list" style="flex:1; overflow-y:auto;"></div>
                    </div>
                    <div style="flex:1; padding-left:10px; display:flex; flex-direction:column;">
                        <h4 id="def-title" style="margin-top:0;">Select a table</h4>
                        <pre id="table-def" class="table-def-pre" style="flex:1; background:#1e1e1e; padding:10px; overflow:auto; font-family:monospace;"></pre>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this.close();
        };

        this.loadDatabases();
        this.overlay.querySelector('#db-select').onchange = (e) => this.loadTables(e.target.value);
        this.overlay.querySelector('#sort-create').onclick = () => this.sort('CREATE_TIME');
        this.overlay.querySelector('#sort-update').onclick = () => this.sort('UPDATE_TIME');
        this.overlay.querySelector('#delete-selected').onclick = () => this.deleteSelected();
    }

    async loadDatabases() {
        try {
            const res = await fetch(API_URL + '?action=get_databases');
            const json = await res.json();
            const select = this.overlay.querySelector('#db-select');
            json.databases.forEach(db => {
                const opt = document.createElement('option');
                opt.value = db;
                opt.text = db;
                select.appendChild(opt);
            });
        } catch (e) { console.error(e); }
    }

    async loadTables(db) {
        if (!db) return;
        this.currentDb = db;
        const list = this.overlay.querySelector('#table-list');
        list.innerHTML = 'Loading...';

        try {
            const res = await fetch(API_URL + `?action=get_table_details&db=${encodeURIComponent(db)}`);
            const json = await res.json();
            this.tablesData = json.tables || [];
            this.renderList();
        } catch (e) { list.innerHTML = 'Error: ' + e.message; }
    }

    renderList() {
        const list = this.overlay.querySelector('#table-list');
        list.innerHTML = '';

        this.tablesData.forEach(t => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.style.flexDirection = 'row';
            item.style.alignItems = 'center';

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.value = t.TABLE_NAME;
            chk.style.marginRight = '10px';
            chk.style.width = '16px';
            chk.style.height = '16px';
            chk.style.flexShrink = '0';
            chk.onclick = (e) => e.stopPropagation();

            const info = document.createElement('div');
            info.style.flex = '1';
            info.innerHTML = `
                <div style="font-weight:bold;">${t.TABLE_NAME}</div>
                <div style="font-size:0.8em; opacity:0.7;">
                    Rows: ${t.TABLE_ROWS || 0} <br>
                    Created: ${t.CREATE_TIME}<br>
                    Updated: ${t.UPDATE_TIME || '-'}
                </div>
            `;

            item.appendChild(chk);
            item.appendChild(info);

            item.onclick = () => this.loadDefinition(this.currentDb, t.TABLE_NAME);
            list.appendChild(item);
        });
    }

    loadDefinition(db, table) {
        new SchemaModal(table, db);
    }

    sort(key) {
        this.tablesData.sort((a, b) => {
            const va = a[key] || '';
            const vb = b[key] || '';
            if (va < vb) return 1;
            if (va > vb) return -1;
            return 0;
        });
        this.renderList();
    }

    async deleteSelected() {
        const checks = this.overlay.querySelectorAll('input[type="checkbox"]:checked');
        if (checks.length === 0) return alert('No tables selected');

        if (!confirm(`Delete ${checks.length} tables? This cannot be undone.`)) return;

        const tables = Array.from(checks).map(c => c.value);
        try {
            const res = await fetch(API_URL + '?action=drop_tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: this.currentDb, tables })
            });
            const json = await res.json();
            alert(`Deleted ${json.count} tables.`);
            this.loadTables(this.currentDb);
        } catch (e) {
            alert('Delete failed: ' + e.message);
        }
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class SchemaModal {
    constructor(tableName, dbName = 'mngtools') {
        this.tableName = tableName;
        this.dbName = dbName;
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:600px;">
                <div class="modal-header">
                    <span>Schema: ${dbName}.${tableName}</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <pre id="schema-content" style="background:#1e1e1e; padding:10px; overflow:auto; font-family:monospace; white-space:pre-wrap;">Loading...</pre>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };

        this.load();
    }

    async load() {
        try {
            const res = await fetch(API_URL + `?action=get_table_definition&db=${encodeURIComponent(this.dbName)}&table=${encodeURIComponent(this.tableName)}`);
            const json = await res.json();
            let def = json.definition || 'No definition found';

            def = def.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            if (def.indexOf('\n') === -1) {
                def = def.replace(/(CREATE TABLE\s+\`[^\`]+\`\s*\()/, '$1\n  ');
                def = def.replace(/,\s*\`/g, ',\n  `');
                def = def.replace(/\s*\)\s*(ENGINE)/g, '\n) $1');
            }

            if (def.endsWith(')')) {
                def = def.substring(0, def.length - 1) + '\n)';
            }

            this.overlay.querySelector('#schema-content').innerText = def;
        } catch (e) {
            this.overlay.querySelector('#schema-content').innerText = 'Error: ' + e.message;
        }
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class ReadmeModal {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:800px; max-width:90vw;">
                <div class="modal-header">
                    <span>Help (README.md)</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="readme-content" style="background:#1e1e1e; padding:20px; line-height:1.6;">Loading...</div>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };

        this.load();
    }

    async load() {
        try {
            const res = await fetch(API_URL + '?action=get_readme');
            const json = await res.json();
            if (json.content) {
                const html = this.parseMarkdown(json.content);
                this.overlay.querySelector('#readme-content').innerHTML = html;
            } else {
                throw new Error('No content');
            }
        } catch (e) {
            this.overlay.querySelector('#readme-content').innerText = 'Error loading README: ' + e.message;
        }
    }

    parseMarkdown(text) {
        let html = text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/^# (.*$)/gim, '<h1 style="border-bottom:1px solid #444; padding-bottom:5px;">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 style="margin-top:20px; border-bottom:1px solid #444;">$1</h2>')
            .replace(/^### (.*$)/gim, '<h3 style="margin-top:15px;">$1</h3>')
            .replace(/^#### (.*$)/gim, '<h4 style="margin-top:10px;">$1</h4>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/`(.*?)`/gim, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:3px;">$1</code>')
            .replace(/```(\w+)?([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:5px; overflow-x:auto;"><code>$2</code></pre>')
            .replace(/\n\n/g, '<p></p>')
            .replace(/\n/g, '<br>');
        return html;
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class GraphInfoModal {
    constructor(currentName, currentDesc, onSave) {
        this.onSave = onSave;
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:400px;">
                <div class="modal-header">
                    <span>Edit Graph Info</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <label>Graph Name (Filename)</label>
                    <input type="text" id="graph-name" value="${currentName}" style="width:100%; margin-bottom:10px;">
                    <label>Description</label>
                    <textarea id="graph-desc" style="width:100%; height:100px;">${currentDesc}</textarea>
                </div>
                <div class="modal-footer">
                    <button class="save-btn" style="background:#38bdf8; color:#0f172a; border:none; padding:5px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.querySelector('.save-btn').onclick = () => this.save();
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };
    }

    save() {
        const name = this.overlay.querySelector('#graph-name').value;
        const desc = this.overlay.querySelector('#graph-desc').value;
        if (this.onSave) this.onSave(name, desc);
        this.close();
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class NodeInfoModal {
    constructor(node, onSave) {
        this.node = node;
        this.onSave = onSave;
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:400px;">
                <div class="modal-header">
                    <span>Edit Node Info</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <label style="display:block; margin-bottom:5px; font-size:0.9em; opacity:0.8;">Label (optional)</label>
                    <input type="text" id="node-label" value="${node.label || ''}" placeholder="${node.typeTitle || 'Node Label'}" style="width:100%; margin-bottom:15px;">
                    <label style="display:block; margin-bottom:5px; font-size:0.9em; opacity:0.8;">Description / Comments</label>
                    <textarea id="node-desc" style="width:100%; height:120px;" placeholder="Add notes about this step...">${node.userDescription || ''}</textarea>
                </div>
                <div class="modal-footer">
                    <button class="save-btn" style="background:#38bdf8; color:#0f172a; border:none; padding:5px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.querySelector('.save-btn').onclick = () => this.save();
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };

        setTimeout(() => {
            const input = this.overlay.querySelector('#node-label');
            if (input) input.focus();
        }, 50);
    }

    save() {
        const label = this.overlay.querySelector('#node-label').value.trim();
        const desc = this.overlay.querySelector('#node-desc').value.trim();
        if (this.onSave) this.onSave(label, desc);
        this.close();
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}

export class ExplanationModal {
    constructor(content) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.innerHTML = `
            <div class="modal-content" style="width:700px; height:80vh;">
                <div class="modal-header">
                    <span>Processing Flow Explanation</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <div id="explanation-content" style="line-height:1.6; color:#eee;">${this.parseMarkdown(content)}</div>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.close-btn').onclick = () => this.close();
        this.overlay.onclick = (e) => { if (e.target === this.overlay) this.close(); };
    }

    parseMarkdown(md) {
        md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const codeBlocks = [];
        let cleanMd = md.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            codeBlocks.push({ lang, code });
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        });

        const tables = [];
        cleanMd = cleanMd.replace(/(^\s*\|.*\|\s*\n\s*\|[\-:\s\|]*\|\s*\n(?:\s*\|.*\|\s*(?:\n|$))*)/gim, (match) => {
            tables.push(match);
            return `__TABLE_BLOCK_${tables.length - 1}__`;
        });

        cleanMd = cleanMd
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        let html = cleanMd
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^### (.*$)/gim, '<h3 style="border-bottom:1px solid #444; padding-bottom:5px; margin-top:20px;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^> (.*$)/gim, '<blockquote style="border-left:4px solid #555; padding-left:10px; color:#aaa; margin:10px 0;">$1</blockquote>')
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code style="background:#333; padding:2px 4px; border-radius:3px; font-family:monospace;">$1</code>')
            .replace(/^\s*-\s*(.*$)/gim, '<li style="margin-left:20px; list-style-type:disc;">$1</li>');

        html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            const block = codeBlocks[index];
            return `<pre style="background:#1e1e1e; padding:10px; border-radius:4px; overflow:auto; margin:10px 0; border:1px solid #333;"><code class="language-${block.lang}">${block.code}</code></pre>`;
        });

        html = html.replace(/__TABLE_BLOCK_(\d+)__/g, (match, index) => {
            const rawTable = tables[index];
            const lines = rawTable.trim().split('\n');
            if (lines.length < 2) return rawTable;

            let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:15px 0;">';

            const headerRow = lines[0].split('|').filter(c => c.trim().length > 0 || c !== '');

            const processRow = (line, isHeader) => {
                const cols = line.split('|');
                if (cols.length > 0 && cols[0].trim() === '') cols.shift();
                if (cols.length > 0 && cols[cols.length - 1].trim() === '') cols.pop();

                let rowHtml = '<tr>';
                cols.forEach(col => {
                    const tag = isHeader ? 'th' : 'td';
                    const style = isHeader
                        ? 'border:1px solid #555; padding:8px; background:#333; color:#fff; text-align:left;'
                        : 'border:1px solid #555; padding:8px; background:#222;';
                    let cellContent = col.trim()
                        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                        .replace(/`([^`]+)`/g, '<code style="background:#444; padding:2px 4px; border-radius:3px;">$1</code>');

                    rowHtml += `<${tag} style="${style}">${cellContent}</${tag}>`;
                });
                rowHtml += '</tr>';
                return rowHtml;
            };

            tableHtml += '<thead>' + processRow(lines[0], true) + '</thead>';
            tableHtml += '<tbody>';
            for (let i = 2; i < lines.length; i++) {
                tableHtml += processRow(lines[i], false);
            }
            tableHtml += '</tbody></table>';
            return tableHtml;
        });

        html = html.replace(/\n/g, '<br>');
        html = html.replace(/<\/h1><br>/g, '</h1>');
        html = html.replace(/<\/h2><br>/g, '</h2>');
        html = html.replace(/<\/h3><br>/g, '</h3>');
        html = html.replace(/<\/pre><br>/g, '</pre>');
        html = html.replace(/<\/blockquote><br>/g, '</blockquote>');
        html = html.replace(/<\/li><br>/g, '</li>');

        return html;
    }

    close() {
        document.body.removeChild(this.overlay);
    }
}
