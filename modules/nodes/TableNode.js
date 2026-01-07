import { Node } from './Node.js';
import { API_URL } from '../Config.js';

export class TableNode extends Node {
    constructor(x, y) {
        super(x, y, 'Table Source');
        this.addOutput();
        this.selectedDb = '';
        this.selectedTable = '';
    }

    async init() {
        this.content.innerHTML = 'Loading DBs...';
        try {
            const res = await fetch(API_URL + '?action=get_databases');
            const json = await res.json();

            this.content.innerHTML = '';

            // Database Select
            const dbSelect = document.createElement('select');
            dbSelect.innerHTML = '<option value="">Select DB</option>';
            json.databases.forEach(db => {
                const opt = document.createElement('option');
                opt.value = db;
                opt.text = db;
                dbSelect.appendChild(opt);
            });

            // Table Select
            const tableSelect = document.createElement('select');
            tableSelect.innerHTML = '<option value="">Select Table</option>';
            tableSelect.disabled = true;

            // Event Listeners
            dbSelect.onchange = async () => {
                this.selectedDb = dbSelect.value;
                this.selectedTable = '';
                tableSelect.innerHTML = '<option value="">Loading...</option>';
                tableSelect.disabled = true;

                if (this.selectedDb) {
                    const res = await fetch(API_URL + `?action=get_tables&db=${this.selectedDb}`);
                    const json = await res.json();

                    tableSelect.innerHTML = '<option value="">Select Table</option>';
                    json.tables.forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t;
                        opt.text = t;
                        tableSelect.appendChild(opt);
                    });
                    tableSelect.disabled = false;
                }
            };

            tableSelect.onchange = () => {
                this.selectedTable = tableSelect.value;
                this.updateOutput();
            };

            this.content.appendChild(dbSelect);
            this.content.appendChild(tableSelect);

        } catch (e) {
            this.content.innerHTML = 'Error loading DBs';
        }
    }

    updateOutput() {
        if (this.selectedDb && this.selectedTable) {
            this.data = { tableName: `${this.selectedDb}.${this.selectedTable}` };
            this.header.style.background = 'rgba(56, 189, 248, 0.4)';
            setTimeout(() => this.header.style.background = '', 1000);
            this.triggerDownstreamUpdates();
        } else {
            this.data = null;
        }
    }

    getDescription(stepMap, connections) {
        return `- **Database**: ${this.selectedDb}\n- **Table**: ${this.selectedTable}`;
    }
}
