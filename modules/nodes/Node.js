import { NodeInfoModal } from '../ui/Modal.js';

export class Node {
    constructor(x, y, title) {
        this.id = 'node_' + Date.now() + Math.random();
        this.x = x;
        this.y = y;
        this.typeTitle = title;
        this.label = '';
        this.userDescription = '';
        this.inputs = []; // Keep track for serialization if needed, though usually inferred from DOM or specific classes
        this.data = null; // Result data

        this.element = document.createElement('div');
        this.element.className = 'node';
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;

        this.header = document.createElement('div');
        this.header.className = 'node-header';

        // Header Content Container
        const headerContent = document.createElement('div');
        headerContent.style.flex = '1';
        headerContent.style.display = 'flex';
        headerContent.style.alignItems = 'center';
        headerContent.style.gap = '8px';
        headerContent.style.overflow = 'hidden';

        this.titleSpan = document.createElement('span');
        this.titleSpan.innerText = title;
        this.titleSpan.style.whiteSpace = 'nowrap';
        this.titleSpan.style.overflow = 'hidden';
        this.titleSpan.style.textOverflow = 'ellipsis';
        headerContent.appendChild(this.titleSpan);

        // Edit Icon
        const editIcon = document.createElement('span');
        editIcon.innerHTML = '✎';
        editIcon.style.fontSize = '0.9em';
        editIcon.style.opacity = '0.4';
        editIcon.style.cursor = 'pointer';
        editIcon.className = 'edit-icon'; // for hover effect
        editIcon.onclick = (e) => {
            e.stopPropagation();
            new NodeInfoModal(this, (l, d) => this.setInfo(l, d));
        };
        editIcon.onmouseenter = () => editIcon.style.opacity = '1';
        editIcon.onmouseleave = () => editIcon.style.opacity = '0.4';

        headerContent.appendChild(editIcon);
        this.header.appendChild(headerContent);

        // Close button
        const close = document.createElement('span');
        close.innerHTML = '&times;';
        close.style.cursor = 'pointer';
        close.style.marginLeft = '10px';
        close.style.fontSize = '1.2em';
        close.onmousedown = (e) => e.stopPropagation();
        close.onclick = (e) => {
            e.stopPropagation();
            if (window.app) window.app.removeNode(this);
        };
        this.header.appendChild(close);

        this.header.onmousedown = (e) => {
            if (window.app) window.app.startDrag(this, e);
        };

        this.content = document.createElement('div');
        this.content.className = 'node-content';
        this.content.style.flex = '1';
        this.content.style.overflow = 'auto';

        this.element.appendChild(this.header);
        this.element.appendChild(this.content);

        // Sockets
        this.inputsDiv = document.createElement('div');
        this.inputsDiv.className = 'node-inputs';
        this.outputsDiv = document.createElement('div');
        this.outputsDiv.className = 'node-outputs';

        this.element.appendChild(this.inputsDiv);
        this.element.appendChild(this.outputsDiv);

        // Resizer
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        this.element.appendChild(resizer);
        resizer.onmousedown = (e) => this.initResize(e);
    }

    setInfo(label, description) {
        this.label = label;
        this.userDescription = description;
        this.updateHeader();
    }

    updateHeader() {
        if (this.label) {
            this.titleSpan.innerHTML = `<span style="font-weight:bold; color:#fff;">${this.label}</span> <span style="font-size:0.8em; opacity:0.7; font-weight:normal;">(${this.typeTitle})</span>`;
        } else {
            this.titleSpan.innerText = this.typeTitle;
        }

        if (this.userDescription) {
            this.header.title = this.userDescription;
        } else {
            this.header.title = '';
        }
    }

    initResize(e) {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = parseInt(document.defaultView.getComputedStyle(this.element).width, 10);
        const startHeight = parseInt(document.defaultView.getComputedStyle(this.element).height, 10);

        const doDrag = (e) => {
            this.element.style.width = (startWidth + e.clientX - startX) + 'px';
            this.element.style.height = (startHeight + e.clientY - startY) + 'px';
            if (window.app) window.app.updateConnections();
        };

        const stopDrag = () => {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        };

        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
    }

    init() {
        // Override
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    addOutput() {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '5px';
        wrapper.style.marginLeft = 'auto'; // Align to right

        const label = document.createElement('span');
        label.style.fontSize = '0.7em';
        label.style.opacity = '0.7';
        label.innerText = 'output';

        const socket = document.createElement('div');
        socket.className = 'socket';
        socket.title = 'Drag to connect';

        // Simple drag to connect logic
        let tempLine = null;

        socket.onmousedown = (e) => {
            e.stopPropagation();
            if (!window.app) return;

            // Calculate start position from socket center
            const nodeRect = this.element.getBoundingClientRect();
            const socketRect = socket.getBoundingClientRect();
            const offsetX = socketRect.left - nodeRect.left + (socketRect.width / 2);
            const offsetY = socketRect.top - nodeRect.top + (socketRect.height / 2);

            const startX = this.x + offsetX;
            const startY = this.y + offsetY;

            tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            tempLine.setAttribute('stroke', '#38bdf8');
            tempLine.setAttribute('stroke-width', '2');
            tempLine.setAttribute('fill', 'none');
            window.app.svg.appendChild(tempLine);

            const move = (ev) => {
                const currX = ev.clientX - window.app.pan.x;
                const currY = ev.clientY - window.app.pan.y;
                const d = `M ${startX} ${startY} L ${currX} ${currY}`;
                tempLine.setAttribute('d', d);
            };

            const up = (ev) => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                window.app.svg.removeChild(tempLine);

                // Check if dropped on a node
                const target = document.elementFromPoint(ev.clientX, ev.clientY);
                if (target && target.classList.contains('socket')) {
                    if (target.closest('.node-inputs')) {
                        const targetNodeEl = target.closest('.node');
                        const targetNode = window.app.nodes.find(n => n.element === targetNodeEl);
                        const socketName = target.dataset.name || 'default';

                        if (targetNode) {
                            window.app.connect(this, targetNode, socketName);
                        }
                    }
                }
            };

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        };

        wrapper.appendChild(label);
        wrapper.appendChild(socket);
        this.outputsDiv.appendChild(wrapper);
    }

    addInput(name = 'default') {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '5px';

        const socket = document.createElement('div');
        socket.className = 'socket';
        socket.dataset.name = name;

        const label = document.createElement('span');
        label.style.fontSize = '0.7em';
        label.style.opacity = '0.7';
        label.innerText = name === 'default' ? '' : name;

        wrapper.appendChild(socket);
        wrapper.appendChild(label);

        this.inputsDiv.appendChild(wrapper);
        return socket;
    }

    async run() {
        // Implementation in subclasses
    }

    async getInputData(socketName = 'default') {
        if (!window.app) return null;
        const conn = window.app.connections.find(c => c.to === this && c.toSocketName === socketName);
        if (conn) {
            if (!conn.from.data) await conn.from.run();
            return conn.from.data;
        }
        return null;
    }

    triggerDownstreamUpdates() {
        if (!window.app || !window.app.connections) return;
        window.app.connections.forEach(c => {
            if (c.from === this && c.to.updatePreview) {
                c.to.updatePreview();
            }
        });
    }

    getDescription(stepMap, connections) {
        return `Default Node Description`;
    }
}
