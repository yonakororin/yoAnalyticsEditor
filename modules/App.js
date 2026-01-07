import { API_URL } from './Config.js';
import { Connection } from './Connection.js';
import { GraphInfoModal, ExplanationModal, SchemaModal, FileExplorerModal } from './ui/Modal.js';
import { TableNode } from './nodes/TableNode.js';
import { FileNode } from './nodes/FileNode.js';
import { QueryNode } from './nodes/QueryNode.js';
import { JoinNode } from './nodes/JoinNode.js';
import { DisplayNode } from './nodes/DisplayNode.js';

export class App {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.canvas = document.getElementById('canvas-container');
        this.svg = document.getElementById('connections-layer');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.draggedNode = null;
        this.mouseOffset = { x: 0, y: 0 };
        this.tempConnection = null;

        this.pan = { x: 0, y: 0 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };

        this.graphName = 'Unsaved';
        this.description = '';

        // Drag Logic
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());

        // Connection Selection
        this.selectedConnection = null;
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedConnection) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                this.removeConnection(this.selectedConnection);
                this.selectedConnection = null;
                e.preventDefault();
            }
        });

        // Toolbar Buttons
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) saveBtn.onclick = () => this.saveGraph();

        const loadBtn = document.getElementById('load-btn');
        if (loadBtn) loadBtn.onclick = () => this.loadGraph();

        const explainBtn = document.getElementById('explain-btn');
        if (explainBtn) explainBtn.onclick = () => this.showExplanation();

        const editInfoBtn = document.getElementById('edit-info-btn');
        if (editInfoBtn) editInfoBtn.onclick = () => this.editGraphInfo();

        // Font Size
        const savedFontSize = localStorage.getItem('app-font-size');
        if (savedFontSize) {
            this.setFontSize(savedFontSize);
            const fontSelect = document.getElementById('font-size-select');
            if (fontSelect) fontSelect.value = savedFontSize;
        }

        // Theme
        const savedTheme = localStorage.getItem('app-theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) themeSelect.value = savedTheme;
        }

        // Expose to window for nodes/connections to access
        window.app = this;
    }

    // フォントサイズを設定し、ローカルストレージに保存します
    setFontSize(size) {
        document.documentElement.style.fontSize = size; // e.g. '14px' or '16px'
        localStorage.setItem('app-font-size', size);
        // Force redraw connections if needed (positions might shift if layout changes, likely not for font size but maybe)
        // this.updateConnections(); 
    }

    // アプリケーションのテーマを設定し、ローカルストレージに保存します
    setTheme(theme) {
        document.body.className = theme; // 'dark-theme' or 'light-theme'
        localStorage.setItem('app-theme', theme);
    }

    // キャンバス上でのマウスダウンイベントを処理します（パンニング開始や選択解除）
    onMouseDown(e) {
        // Panning logic (Middle click or Space+Click or just click on background)
        if (e.target === this.canvas || e.target === this.svg) {
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
            this.canvas.style.cursor = 'grabbing';

            // Deselect connection if clicking background
            if (this.selectedConnection) {
                this.selectedConnection.deselect();
                this.selectedConnection = null;
            }
        }
    }

    // キャンバス上でのマウス移動イベントを処理します（パンニング中やノードドラッグ中）
    onMouseMove(e) {
        if (this.isPanning) {
            this.pan.x = e.clientX - this.panStart.x;
            this.pan.y = e.clientY - this.panStart.y;
            this.updateTransform();
        } else if (this.draggedNode) {
            const x = (e.clientX - this.pan.x) - this.mouseOffset.x;
            const y = (e.clientY - this.pan.y) - this.mouseOffset.y;
            this.draggedNode.setPosition(x, y);
            this.updateConnections();
        }
    }

    // マウスアップイベントを処理します（ドラッグやパンニングの終了）
    onMouseUp() {
        this.isPanning = false;
        this.draggedNode = null;
        this.canvas.style.cursor = 'default';
    }

    // パンニング位置に基づいてレイヤーのトランスフォームを更新します
    updateTransform() {
        this.nodesLayer.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px)`;
        this.svg.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px)`;
    }

    // ノードのドラッグ操作を開始します
    startDrag(node, e) {
        e.stopPropagation();
        this.draggedNode = node;
        this.mouseOffset = {
            x: (e.clientX - this.pan.x) - node.x,
            y: (e.clientY - this.pan.y) - node.y
        };

        // Move to front
        this.nodesLayer.appendChild(node.element);
    }

    // 指定されたタイプの新しいノードを追加します
    addNode(type, x = null, y = null) {
        if (x === null) x = -this.pan.x + (this.canvas.clientWidth / 2) - 100;
        if (y === null) y = -this.pan.y + (this.canvas.clientHeight / 2) - 50;

        let node;
        switch (type) {
            case 'table': node = new TableNode(x, y); break;
            case 'file': node = new FileNode(x, y); break;
            case 'query': node = new QueryNode(x, y); break;
            case 'join': node = new JoinNode(x, y); break;
            case 'display': node = new DisplayNode(x, y); break;
        }
        if (node) {
            this.nodes.push(node);
            this.nodesLayer.appendChild(node.element);
            node.init();
        }
    }

    // 既存のノードインスタンスを追加します（復元時など）
    addNodeInstance(node) {
        this.nodes.push(node);
        this.nodesLayer.appendChild(node.element);
        node.init();
    }

    // 指定されたノードを削除します
    removeNode(node) {
        if (!confirm('Delete this node?')) return;

        // Remove connections
        this.connections = this.connections.filter(c => {
            if (c.from === node || c.to === node) {
                c.remove();
                return false;
            }
            return true;
        });

        // Remove element
        this.nodesLayer.removeChild(node.element);
        this.nodes = this.nodes.filter(n => n !== node);
    }

    // 2つのノード間の接続を作成します
    connect(fromNode, toNode, toSocketName) {
        // Check if already connected to this input
        const existing = this.connections.find(c => c.to === toNode && c.toSocketName === toSocketName);
        if (existing) {
            existing.remove();
            this.connections = this.connections.filter(c => c !== existing);
        }

        const conn = new Connection(fromNode, toNode, toSocketName, this.svg);
        this.connections.push(conn);
        conn.update();

        // Trigger downstream update if possible
        if (toNode.run) toNode.run(); // or trigger
    }

    // 接続を削除します
    removeConnection(conn) {
        conn.remove();
        this.connections = this.connections.filter(c => c !== conn);
    }

    // 接続を選択状態にします
    selectConnection(conn) {
        if (this.selectedConnection) this.selectedConnection.deselect();
        this.selectedConnection = conn;
        conn.select();
    }

    // 全ての接続の描画を更新します（ノード移動時など）
    updateConnections() {
        this.connections.forEach(c => c.update());
    }

    // グラフ全体（ノードと接続）をクリアします
    clear() {
        this.nodes.forEach(n => this.nodesLayer.removeChild(n.element));
        this.nodes = [];
        this.connections.forEach(c => c.remove());
        this.connections = [];
        this.graphName = 'Unsaved';
        this.description = '';
        this.updateGraphInfo('Unsaved', '');
    }

    // 現在のグラフをサーバーにJSONファイルとして保存します
    async saveGraph() {
        const name = prompt('Enter filename (e.g. graph.json):', this.graphName.endsWith('.json') ? this.graphName : this.graphName + '.json');
        if (!name) return;

        const data = {
            meta: {
                description: this.description
            },
            nodes: this.nodes.map(n => {
                const base = {
                    id: n.id,
                    type: n.constructor.name,
                    x: n.x,
                    y: n.y,
                    label: n.label || '',
                    userDescription: n.userDescription || ''
                };

                if (n instanceof QueryNode) {
                    base.sql = n.textarea ? n.textarea.value : '';
                    base.inputCount = n.inputCount;
                } else if (n instanceof TableNode) {
                    base.selectedDb = n.selectedDb;
                    base.selectedTable = n.selectedTable;
                } else if (n instanceof FileNode) {
                    base.currentPath = n.currentPath;
                    base.selectedFiles = n.selectedFiles;
                    base.selectedFile = n.selectedFile; // legacy
                    base.hasHeader = n.hasHeader;
                } else if (n instanceof DisplayNode) {
                    base.exportPath = n.exportPath;
                    base.exportName = n.exportName;
                    base.exportType = n.exportType;
                    base.spreadsheetId = n.spreadsheetId;
                    base.sheetName = n.sheetName;
                    base.credentialsPath = n.credentialsPath;
                } else if (n instanceof JoinNode) {
                    base.joinKey = n.joinKey;
                }

                return base;
            }),
            connections: this.connections.map(c => ({
                from: c.from.id,
                to: c.to.id,
                toSocketName: c.toSocketName
            }))
        };

        try {
            const res = await fetch(API_URL + '?action=save_file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: name, content: JSON.stringify(data, null, 2) })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            this.updateGraphInfo(name, this.description);
            alert('Saved!');
        } catch (e) {
            alert('Save failed: ' + e.message);
        }
    }

    // サーバーからグラフファイルをロードし、グラフを再構築します
    async loadGraph() {
        new FileExplorerModal(async (path) => {
            try {
                const res = await fetch(API_URL + `?action=load_file&path=${encodeURIComponent(path)}`);
                const json = await res.json();
                if (json.error) throw new Error(json.error);

                const graph = JSON.parse(json.content);

                this.clear();
                const idMap = {};

                // Reconstruct nodes
                for (const n of graph.nodes) {
                    let node;
                    switch (n.type) {
                        case 'TableNode': node = new TableNode(n.x, n.y); break;
                        case 'FileNode': node = new FileNode(n.x, n.y); break;
                        case 'QueryNode': node = new QueryNode(n.x, n.y); break;
                        case 'JoinNode': node = new JoinNode(n.x, n.y); break;
                        case 'DisplayNode': node = new DisplayNode(n.x, n.y); break;
                        default: continue;
                    }

                    this.nodes.push(node);
                    this.nodesLayer.appendChild(node.element);
                    node.element.style.left = n.x + 'px';
                    node.element.style.top = n.y + 'px';
                    // Restore ID to match connection map
                    node.id = n.id;
                    idMap[n.id] = node;

                    // Restore meta
                    if (n.label || n.userDescription) {
                        node.setInfo(n.label || '', n.userDescription || '');
                    }

                    await node.init();

                    // Restore State
                    if (n.type === 'QueryNode') {
                        node.textarea.value = n.sql || '';
                        if (n.inputCount > 1) {
                            for (let i = 1; i < n.inputCount; i++) node.addInputSocket();
                        }
                    } else if (n.type === 'TableNode') {
                        node.selectedDb = n.selectedDb;
                        node.selectedTable = n.selectedTable;
                        if (node.selectedDb && node.selectedTable) node.updateOutput();
                    } else if (n.type === 'FileNode') {
                        node.currentPath = n.currentPath || '';
                        node.selectedFiles = n.selectedFiles || (n.selectedFile ? [n.selectedFile] : []);
                        node.hasHeader = n.hasHeader !== undefined ? n.hasHeader : true;
                        node.renderExplorer(node.currentPath);
                        node.updateOutput();
                    } else if (n.type === 'DisplayNode') {
                        node.exportPath = n.exportPath || '';
                        node.exportName = n.exportName || 'export.csv';
                        node.exportType = n.exportType || 'file';
                        node.spreadsheetId = n.spreadsheetId || '';
                        node.sheetName = n.sheetName || '';
                        // If we had render logic that could run without data, call it, but DisplayNode needs data.
                    } else if (n.type === 'JoinNode') {
                        node.joinKey = n.joinKey || '';
                        const input = node.content.querySelector('.join-key');
                        if (input) input.value = node.joinKey;
                    }
                }

                // Connections
                for (const c of graph.connections) {
                    const from = idMap[c.from];
                    const to = idMap[c.to];
                    if (from && to) {
                        this.connect(from, to, c.toSocketName);
                    }
                }

                alert('Loaded!');
                this.updateGraphInfo(path, graph.meta ? graph.meta.description : '');
            } catch (e) {
                alert('Load failed: ' + e.message);
            }
        }, 'file');
    }

    // グラフのメタデータ（名前、説明）をUIに反映します
    updateGraphInfo(name, description) {
        this.graphName = name || 'Unsaved';
        this.description = description || '';

        const titleEl = document.getElementById('current-file');
        if (titleEl) titleEl.innerText = this.graphName;
        document.title = this.graphName + ' - Visual SQL Builder';

        const descEl = document.getElementById('graph-description');
        if (descEl) {
            if (this.description) {
                descEl.innerText = this.description;
                descEl.style.display = 'block';
            } else {
                descEl.style.display = 'none';
            }
        }
    }

    // グラフ情報編集モーダルを開きます
    editGraphInfo() {
        new GraphInfoModal(this.graphName, this.description, (name, desc) => {
            this.updateGraphInfo(name, desc);
        });
    }

    // サーバーサイドの一時ファイルやキャッシュをクリアします
    async cleanup() {
        if (!confirm('Clear all server-side cache/temp files?')) return;
        try {
            const res = await fetch(API_URL + '?action=cleanup', { method: 'POST' });
            const json = await res.json();
            alert(json.message || 'Cleanup done');
        } catch (e) {
            alert('Cleanup failed: ' + e.message);
        }
    }

    // テーブル定義表示モーダルを開きます
    viewTableDefinition(tableName) {
        new SchemaModal(tableName, 'mngtools');
    }

    // グラフの処理フロー説明を生成し、表示します
    showExplanation() {
        const visited = new Set();
        const stack = [];
        const nodes = this.nodes;
        const adj = new Map();
        nodes.forEach(n => adj.set(n, []));

        this.connections.forEach(c => {
            if (adj.has(c.from)) {
                adj.get(c.from).push(c.to);
            }
        });

        const visit = (node) => {
            visited.add(node);
            const formatting = adj.get(node) || [];
            for (const neighbor of formatting) {
                if (!visited.has(neighbor)) {
                    visit(neighbor);
                }
            }
            stack.push(node);
        };

        nodes.forEach(n => {
            if (!visited.has(n)) {
                visit(n);
            }
        });

        const sortedNodes = stack.reverse();
        const stepMap = new Map();
        sortedNodes.forEach((node, index) => {
            stepMap.set(node.id, `Step ${index + 1}`);
        });

        let md = `# グラフ処理フロー説明\n\n`;
        if (this.description) {
            md += `> ${this.description}\n\n`;
        }

        sortedNodes.forEach((node, index) => {
            if (node.getDescription) {
                const stepLabel = stepMap.get(node.id);
                const title = node.label ? `${stepLabel}: ${node.label} (${node.constructor.name})` : `${stepLabel} (${node.constructor.name})`;
                md += `### ${title}\n`;
                if (node.userDescription) {
                    md += `> ${node.userDescription.replace(/\n/g, '  \n')}\n\n`;
                }
                md += node.getDescription(stepMap, this.connections) + '\n';
            }
        });

        new ExplanationModal(md);
    }
}
