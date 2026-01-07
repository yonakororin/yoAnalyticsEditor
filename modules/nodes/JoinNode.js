import { Node } from './Node.js';
import { API_URL } from '../Config.js';

export class JoinNode extends Node {
    constructor(x, y) {
        super(x, y, 'Filtering Node');
        this.addInput('source');
        this.addInput('filter');
        this.addOutput();
        this.joinKey = 'user_id';

        // Stack inputs vertically
        this.inputsDiv.style.flexDirection = 'column';
        this.inputsDiv.style.alignItems = 'flex-start'; // Align left
        this.inputsDiv.style.gap = '5px';
    }

    init() {
        this.content.innerHTML = `
            <div style="margin-bottom:5px;">
                <label style="display:block; font-size:0.8em; color:#aaa;">Join Key</label>
                <input type="text" class="join-key" value="${this.joinKey}" placeholder="e.g. user_id">
            </div>
            <button class="run-btn">Run Join</button>
        `;

        const input = this.content.querySelector('input');
        const btn = this.content.querySelector('button');

        input.onchange = () => {
            this.joinKey = input.value;
        };

        btn.onclick = () => this.run();
    }

    async run() {
        if (!this.joinKey) {
            alert('Please specify a Join Key');
            return;
        }

        const sourceData = await this.getInputData('source');
        const filterData = await this.getInputData('filter');

        if (!sourceData || !sourceData.tableName) {
            alert('Source input is missing');
            return;
        }
        if (!filterData || !filterData.tableName) {
            alert('Filter input is missing');
            return;
        }

        this.header.style.background = '';
        this.content.style.opacity = '0.5';

        // Construct Query
        // SELECT t1.* FROM source t1 INNER JOIN filter t2 ON t1.key = t2.key
        const sql = `SELECT t1.* FROM ${sourceData.tableName} t1 INNER JOIN ${filterData.tableName} t2 ON t1.${this.joinKey} = t2.${this.joinKey}`;

        try {
            const res = await fetch(API_URL + '?action=query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: sql })
            });

            const json = await res.json();
            if (json.error) {
                throw new Error(json.error);
            } else {
                this.data = {
                    tableName: json.table,
                    rows: json.rows,
                    total_rows: json.total_rows,
                    joinKey: this.joinKey
                };

                this.header.style.background = 'rgba(56, 189, 248, 0.4)';
                setTimeout(() => this.header.style.background = '', 1000);
                this.triggerDownstreamUpdates();
            }
        } catch (e) {
            alert('Join failed: ' + e.message);
        } finally {
            this.content.style.opacity = '1';
        }
    }

    getDescription(stepMap, connections) {
        let desc = `- **アクション**: JOIN (フィルタリング)を実行\n`;
        desc += `- **キー**: \`${this.joinKey}\`\n`;

        // Source
        const sourceConn = connections.find(c => c.to === this && c.toSocketName === 'source');
        if (sourceConn) {
            const sStep = stepMap.get(sourceConn.from.id) || '?';
            desc += `- **Source (Left)**: **${sStep}**\n`;
        } else {
            desc += `- **Source (Left)**: 未接続\n`;
        }

        // Filter
        const filterConn = connections.find(c => c.to === this && c.toSocketName === 'filter');
        if (filterConn) {
            const fStep = stepMap.get(filterConn.from.id) || '?';
            desc += `- **Filter (Right)**: **${fStep}**\n`;
        } else {
            desc += `- **Filter (Right)**: 未接続\n`;
        }

        return desc;
    }
}
