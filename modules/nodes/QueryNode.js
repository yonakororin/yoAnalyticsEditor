import { Node } from './Node.js';
import { API_URL } from '../Config.js';
import { Autocomplete } from '../ui/Modal.js';

export class QueryNode extends Node {
    constructor(x, y) {
        super(x, y, 'SQL Query');
        this.inputCount = 0;
        this.element.classList.add('resizable');

        // Custom Layout for QueryNode: Inputs at bottom left, Outputs at bottom right
        // create a footer container
        this.footer = document.createElement('div');
        this.footer.style.display = 'flex';
        this.footer.style.justifyContent = 'space-between';
        this.footer.style.alignItems = 'flex-end';
        this.footer.style.marginTop = '5px';

        // Move inputs and outputs into footer
        this.element.appendChild(this.footer);
        this.footer.appendChild(this.inputsDiv);
        this.footer.appendChild(this.outputsDiv);

        // Adjust styling for this layout
        this.inputsDiv.style.flex = '1';
        this.inputsDiv.style.flexDirection = 'column';
        this.inputsDiv.style.justifyContent = 'flex-start';
        this.inputsDiv.style.flexWrap = 'wrap';

        this.outputsDiv.style.marginLeft = '0';

        this.addInputSocket(); // Default 'input'
        this.addOutput();
    }

    addInputSocket() {
        this.inputCount++;
        const name = this.inputCount === 1 ? 'input' : 'input' + this.inputCount;
        const socketEl = this.addInput(name); // returns socket element, but we want the wrapper too often

        // Node.addInput adds to inputsDiv. socketEl is the .socket div.
        const wrapper = socketEl.parentElement;

        if (this.inputCount > 1) {
            const delBtn = document.createElement('span');
            delBtn.innerHTML = '&times;';
            delBtn.style.cursor = 'pointer';
            delBtn.style.marginLeft = '5px';
            delBtn.style.color = '#ff6b6b';
            delBtn.style.fontWeight = 'bold';
            delBtn.title = 'Remove Input';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeInputSocket(name, wrapper);
            };
            wrapper.appendChild(delBtn);
        }
    }

    removeInputSocket(name, wrapper) {
        if (!confirm(`Remove ${name}?`)) return;

        // Disconnect
        // Since we don't have direct access to app connections easily unless global, 
        // we use window.app (Node logic uses it)
        if (window.app && window.app.connections) {
            const toRemove = window.app.connections.filter(c => c.to === this && c.toSocketName === name);
            toRemove.forEach(c => c.remove());
        }

        // Remove from DOM
        if (wrapper && wrapper.parentElement) {
            wrapper.parentElement.removeChild(wrapper);
        }
    }

    getDescription(stepMap, connections) {
        let desc = `- **アクション**: SQLクエリを実行\n`;

        const currentInputs = Array.from(this.inputsDiv.children);
        const inputs = [];

        currentInputs.forEach(wrapper => {
            const socket = wrapper.querySelector('.socket');
            if (!socket) return;
            const name = socket.dataset.name;

            // Find connection
            const conn = connections.find(c => c.to === this && c.toSocketName === name);
            if (conn) {
                const sourceStep = stepMap.get(conn.from.id) || 'Unknown Step';
                let sourceInfo = 'Source';
                if (conn.from.constructor.name === 'FileNode') {
                    const files = conn.from.selectedFiles || [];
                    sourceInfo = `File: ${files.length > 1 ? files.length + ' files' : (files[0] || 'None')}`;
                } else if (conn.from.constructor.name === 'TableNode') {
                    sourceInfo = `Table: ${conn.from.selectedTable}`;
                } else if (conn.from.constructor.name === 'SourceNode') {
                    sourceInfo = `Dates`;
                }
                inputs.push(`- **${name}**: 受け取るデータ -> **${sourceStep}** (${sourceInfo})`);
            } else {
                inputs.push(`- **${name}**: 未接続`);
            }
        });

        if (inputs.length > 0) desc += inputs.join('\n') + '\n';
        desc += `- **SQL**:\n\`\`\`sql\n${this.textarea ? this.textarea.value : ''}\n\`\`\`\n`;

        return desc;
    }

    init() {
        this.content.innerHTML = `
            <div style="font-size:0.8em; opacity:0.7; margin-bottom:5px;">
                Macros: {input}, {input2}... (Shift+Enter: Newline) <button id="add-input-btn" style="font-size:0.8em; padding:2px 5px;">+ Input</button>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; min-height:0;">
                <textarea placeholder="SELECT * FROM {input}" style="flex:1; resize:none; width:100%; box-sizing:border-box;">SELECT * FROM {input}</textarea>
            </div>
            <div class="sql-preview" style="margin-top:5px; padding:5px; background:rgba(0,0,0,0.5); border-radius:4px; font-family:monospace; font-size:0.8em; display:none; white-space:pre-wrap; color:#a5d6ff; max-height:100px; overflow-y:auto;"></div>
            <div style="margin-top:5px; display:flex; align-items:center; gap:5px;">
                <input type="text" class="index-input" placeholder="Index Col (Opt)" style="font-size:0.8em; padding:4px; flex:1; min-width:0; background:#333; color:#fff; border:1px solid #555; border-radius:3px;">
                <button class="run-btn" style="padding:4px 10px; cursor:pointer; background:#2fa; color:#000; border:none; border-radius:3px; font-weight:bold;">Run</button>
            </div>
        `;

        const textarea = this.content.querySelector('textarea');
        const btn = this.content.querySelector('button.run-btn');
        const previewEl = this.content.querySelector('.sql-preview');
        const addInputBtn = this.content.querySelector('#add-input-btn');
        // const indexInput = this.content.querySelector('.index-input'); // Accessed in run()

        addInputBtn.onclick = () => {
            this.addInputSocket();
        };

        // Autocomplete Integration
        new Autocomplete(textarea, {
            getCandidates: async (query) => {
                const q = query.toUpperCase();

                // 1. SQL Keywords
                const keywords = [
                    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
                    'INNER JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
                    'OFFSET', 'UNION', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
                    'MAX', 'MIN', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN',
                    'LIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CREATE TABLE',
                    'INSERT INTO', 'UPDATE', 'DELETE', 'DROP TABLE', 'ALTER TABLE'
                ];

                // 2. Macros (Scan current inputs)
                const macros = [];
                Array.from(this.inputsDiv.children).forEach(wrapper => {
                    const s = wrapper.querySelector('.socket');
                    if (s) macros.push(`{${s.dataset.name}}`);
                });

                let candidates = [];

                // Filter Keywords
                keywords.forEach(k => {
                    if (k.startsWith(q)) candidates.push({ text: k, type: 'keyword' });
                });

                // Filter Macros
                macros.forEach(m => {
                    if (m.toUpperCase().startsWith(q)) candidates.push({ text: m, type: 'macro' });
                });

                // 3. Tables (if query looks like a table name start)
                if (!window.cachedTables) {
                    try {
                        // Just fetch tables from default
                        const res = await fetch(API_URL + `?action=get_tables&db=mngtools`);
                        const json = await res.json();
                        window.cachedTables = json.tables;
                    } catch (e) { window.cachedTables = []; }
                }

                if (window.cachedTables) {
                    window.cachedTables.forEach(t => {
                        if (t.toUpperCase().startsWith(q)) candidates.push({ text: t, type: 'table' });
                    });
                }

                return candidates;
            }
        });

        // Real-time Preview
        textarea.oninput = () => {
            this.updatePreview(textarea.value, previewEl);
        };
        // Stop bubbling so resize handle works cleanly
        textarea.onmousedown = (e) => e.stopPropagation();

        this.textarea = textarea; // Store for run method
        this.preview = previewEl; // Store for run method

        btn.onclick = () => this.run();
    }

    updatePreview(sql = null, previewEl = null) {
        if (!sql) sql = this.textarea ? this.textarea.value : '';
        if (!previewEl) previewEl = this.preview;
        if (!previewEl) return;

        // Resolve macros
        let resolvedSql = sql;

        // Iterate current inputs
        Array.from(this.inputsDiv.children).forEach(wrapper => {
            const s = wrapper.querySelector('.socket');
            if (!s) return;
            const name = s.dataset.name;
            const inputData = this._getConnectedInputData(name);
            // RegEx to replace {name}
            resolvedSql = resolvedSql.replace(new RegExp(`{${name}}`, 'g'), inputData?.tableName || '???');
        });

        previewEl.style.display = 'block';
        previewEl.textContent = '> ' + resolvedSql;
    }

    _getConnectedInputData(socketName) {
        if (!window.app) return null;
        const conn = window.app.connections.find(c => c.to === this && c.toSocketName === socketName);
        if (conn && conn.from.data) {
            return conn.from.data;
        }
        return null;
    }

    async run() {
        const sql = this.textarea.value;
        if (!sql) {
            alert('SQL query cannot be empty.');
            return;
        }

        // Reset result
        this.data = null;
        this.header.style.background = '';

        this.content.style.opacity = '0.5';

        try {
            // Collect all inputs and resolve macros for execution
            const inputs = {};
            const inputSockets = Array.from(this.inputsDiv.querySelectorAll('.socket'));

            for (const socket of inputSockets) {
                const name = socket.dataset.name;
                const data = await this.getInputData(name); // This will trigger upstream run if needed
                if (data && data.tableName) {
                    inputs[name] = data.tableName;
                }
            }

            let resolvedSql = sql;
            let missingInput = false;

            for (const [key, val] of Object.entries(inputs)) {
                const regex = new RegExp(`{${key}}`, 'g');
                resolvedSql = resolvedSql.replace(regex, val);
            }

            // Check for unresolved macros after replacement
            if (resolvedSql.match(/{input\d*}/)) {
                alert('Missing input connections for some macros in the query.');
                missingInput = true;
            }

            if (missingInput) {
                this.content.style.opacity = '1';
                return;
            }

            // Show preview
            this.preview.style.display = 'block';
            this.preview.textContent = '> ' + resolvedSql;

            const indexInput = this.content.querySelector('.index-input');
            const indexCol = indexInput ? indexInput.value : '';

            const res = await fetch(API_URL + '?action=query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: resolvedSql, index_column: indexCol })
            });

            const json = await res.json();
            if (json.error) {
                throw new Error(json.error);
            } else {
                this.data = {
                    tableName: json.table,
                    rows: json.rows,
                    total_rows: json.total_rows,
                    columns: json.columns
                };


                this.header.style.background = 'rgba(56, 189, 248, 0.4)'; // Success blue
                setTimeout(() => this.header.style.background = '', 1000);
                this.triggerDownstreamUpdates();
            }
        } catch (e) {
            alert('Query failed: ' + e.message);
        } finally {
            this.content.style.opacity = '1';
        }
    }
}
