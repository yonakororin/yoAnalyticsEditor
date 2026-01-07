import { Node } from './Node.js';
import { API_URL } from '../Config.js';
import { FileExplorerModal } from '../ui/Modal.js';

export class DisplayNode extends Node {
    constructor(x, y) {
        super(x, y, 'Result View');
        this.addInput();
        this.addInput();
        this.element.style.width = '400px';
        this.exportPath = '';
        this.exportName = 'export.csv';
        this.exportType = 'file'; // file or google_sheet
        this.spreadsheetId = '';
        this.sheetName = '';
        this.credentialsPath = 'config/service_account.json';
        this.pageSize = 15;
        this.currentPage = 1;
    }

    init() {
        this.content.innerHTML = '<div style="padding:10px; text-align:center; opacity:0.5">Connect output to view results</div>';
    }

    updatePreview() {
        this.run();
    }

    copyToClipboard() {
        if (!this.data || !this.data.rows) {
            alert('No data to copy');
            return;
        }

        const cols = this.data.columns || [];
        const rows = this.data.rows;

        // Header
        let tsv = cols.join('\t') + '\n';

        // Rows
        tsv += rows.map(row => {
            return cols.map(col => {
                let cell = row[col] === null || row[col] === undefined ? '' : String(row[col]);
                // Handle tabs/newlines in content if any (replace with space to prevent breaking format)
                return cell.replace(/[\t\n\r]/g, ' ');
            }).join('\t');
        }).join('\n');

        navigator.clipboard.writeText(tsv).then(() => {
            alert('Copied to clipboard!\nYou can paste this into Excel or Google Sheets.');
        }).catch(err => {
            alert('Failed to copy: ' + err);
        });
    }

    async run() {
        // Triggered by upstream usually, but here manual refresh
        const inputData = await this.getInputData();

        if (inputData) {
            this.data = inputData; // Store latest data for export
            this.currentPage = 1; // Reset to first page on new data
            this.render(inputData);
        }
    }

    render(data) {
        if (!data || !data.rows) {
            this.content.innerHTML = 'No data';
            return;
        }

        const rows = data.rows;
        if (rows.length === 0) {
            this.content.innerHTML = 'Empty result set';
            return;
        }

        // Calculate slice first
        const totalPages = Math.ceil(rows.length / this.pageSize);
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageRows = rows.slice(start, end);

        // Export UI & Pagination Controls container
        const controlsDiv = document.createElement('div');
        controlsDiv.style.borderBottom = '1px solid #444';
        controlsDiv.style.padding = '5px';
        controlsDiv.style.marginBottom = '5px';
        controlsDiv.style.display = 'flex';
        controlsDiv.style.flexDirection = 'column';
        controlsDiv.style.gap = '5px';

        // Export Row
        const exportRow = document.createElement('div');
        exportRow.style.display = 'flex';
        exportRow.style.gap = '5px';
        exportRow.style.alignItems = 'center';
        exportRow.innerHTML = `
            <div style="flex:1;">
                <select id="export-type" style="font-size:0.8em; margin-bottom:2px; width:100%; border:1px solid #555; background:#333; color:#eee;">
                    <option value="file">Local File (CSV)</option>
                    <option value="google_sheet">Google Sheet</option>
                    <option value="stdout">Standard Output (CLI only)</option>
                </select>
                <div id="file-inputs">
                    <input type="text" id="export-path" placeholder="Output Folder (/...)" value="${this.exportPath || ''}" style="font-size:0.8em; margin-bottom:2px; width:100%;">
                    <input type="text" id="export-name" placeholder="filename.csv" value="${this.exportName || 'export.csv'}" style="font-size:0.8em; width:100%;">
                </div>
                <div id="gs-inputs" style="display:none;">
                    <input type="text" id="spreadsheet-id" placeholder="Spreadsheet ID" value="${this.spreadsheetId || ''}" style="font-size:0.8em; margin-bottom:2px; width:100%;">
                    <input type="text" id="sheet-name" placeholder="Sheet Name" value="${this.sheetName || ''}" style="font-size:0.8em; width:100%;">
                </div>
            </div>
            <button id="copy-tsv-btn" style="font-size:0.8em; padding:5px; background:#8b5cf6;" title="Copy to Clipboard for Excel/Sheets">📋 Copy</button>
            <button id="export-btn" style="font-size:0.8em; padding:5px;">Export</button>
        `;
        controlsDiv.appendChild(exportRow);

        // Pagination Row
        const paginationRow = document.createElement('div');
        paginationRow.style.display = 'flex';
        paginationRow.style.justifyContent = 'space-between';
        paginationRow.style.alignItems = 'center';
        paginationRow.style.fontSize = '0.8em';

        const prevBtn = document.createElement('button');
        prevBtn.innerText = 'Prev';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render(this.data);
            }
        };

        const nextBtn = document.createElement('button');
        nextBtn.innerText = 'Next';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render(this.data);
            }
        };

        const totalRows = this.data.total_rows || rows.length;
        const startDisp = start + 1;
        const endDisp = Math.min(start + this.pageSize, rows.length);

        const info = document.createElement('span');
        info.innerText = `Page ${this.currentPage} / ${totalPages} (Showing ${startDisp}-${endDisp} of ${totalRows} rows)`;

        paginationRow.appendChild(prevBtn);
        paginationRow.appendChild(info);
        paginationRow.appendChild(nextBtn);
        controlsDiv.appendChild(paginationRow);

        // Wiring up Export logic
        const typeSelect = exportRow.querySelector('#export-type');
        const fileInputs = exportRow.querySelector('#file-inputs');
        const gsInputs = exportRow.querySelector('#gs-inputs');
        const pathInput = exportRow.querySelector('#export-path');
        const nameInput = exportRow.querySelector('#export-name');
        const spreadsheetIdInput = exportRow.querySelector('#spreadsheet-id');
        const sheetNameInput = exportRow.querySelector('#sheet-name');

        exportRow.querySelector('#copy-tsv-btn').onclick = () => this.copyToClipboard();
        const btn = exportRow.querySelector('#export-btn');

        // Logic to toggle visibility
        const updateVisibility = () => {
            if (this.exportType === 'google_sheet') {
                fileInputs.style.display = 'none';
                gsInputs.style.display = 'block';
            } else if (this.exportType === 'stdout') {
                fileInputs.style.display = 'none';
                gsInputs.style.display = 'none';
            } else {
                fileInputs.style.display = 'block';
                gsInputs.style.display = 'none';
            }
            typeSelect.value = this.exportType;
        };
        updateVisibility();

        typeSelect.onchange = (e) => {
            this.exportType = e.target.value;
            updateVisibility();
        };

        pathInput.setAttribute('list', 'folder-suggestions');

        // Add Browse Button logic (simplified)
        const browseBtn = document.createElement('button');
        browseBtn.innerText = '📁';
        browseBtn.title = 'Browse Folder';
        browseBtn.style.padding = '2px 5px';
        browseBtn.style.marginRight = '5px';
        browseBtn.style.fontSize = '0.8em';
        browseBtn.onclick = () => {
            new FileExplorerModal((path) => {
                this.exportPath = path;
                pathInput.value = path;
            });
        };
        pathInput.parentNode.insertBefore(browseBtn, pathInput);

        // Listeners to update persistent state
        pathInput.oninput = (e) => { this.exportPath = e.target.value; };
        nameInput.oninput = (e) => { this.exportName = e.target.value; };

        spreadsheetIdInput.oninput = (e) => { this.spreadsheetId = e.target.value; };
        sheetNameInput.oninput = (e) => { this.sheetName = e.target.value; };

        pathInput.onclick = () => {
            new FileExplorerModal((path) => {
                this.exportPath = path;
                pathInput.value = path;
            });
        };

        btn.onclick = async () => {
            if (this.exportType === 'google_sheet') {
                if (!this.spreadsheetId || !this.sheetName) {
                    alert('Please specify Spreadsheet ID and Sheet Name');
                    return;
                }
                this.exportData(data.tableName, {
                    type: 'google_sheet',
                    spreadsheetId: this.spreadsheetId,
                    sheetName: this.sheetName
                });
            } else {
                const folder = pathInput.value;
                const filename = nameInput.value;
                if (!folder || !filename) {
                    alert('Please specify folder and filename');
                    return;
                }
                const fullPath = folder.endsWith('/') ? folder + filename : folder + '/' + filename;
                this.exportData(data.tableName, {
                    type: 'file',
                    path: fullPath
                });
            }
        };

        // Persist path
        pathInput.onchange = () => { this.exportPath = pathInput.value; };


        // Render Table Slice
        const headers = Object.keys(rows[0]);
        let html = '<div style="flex:1; overflow:auto;"><table class="result-table"><thead><tr>';
        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';

        pageRows.forEach(r => {
            html += '<tr>';
            headers.forEach(h => html += `<td>${r[h]}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        this.content.innerHTML = '';
        this.content.appendChild(controlsDiv);

        const tableDiv = document.createElement('div');
        tableDiv.style.flex = '1';
        tableDiv.style.overflow = 'hidden'; /* let child scroll */
        tableDiv.style.display = 'flex';
        tableDiv.style.flexDirection = 'column';
        tableDiv.innerHTML = html;
        this.content.appendChild(tableDiv);

        this.header.style.background = 'rgba(56, 189, 248, 0.4)';
        setTimeout(() => this.header.style.background = '', 1000);
    }

    async exportData(tableName, options) {
        const btn = this.content.querySelector('#export-btn');
        const originalText = btn.innerText;
        btn.innerText = '...';
        btn.disabled = true;

        try {
            // Merge options into payload
            const payload = { table: tableName, ...options };

            const res = await fetch(API_URL + '?action=export_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);

            if (options.type === 'google_sheet') {
                alert(`Export success!`);
            } else {
                alert(`Exported ${json.count} rows to ${json.path}`);
            }
        } catch (e) {
            alert('Export failed: ' + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}
