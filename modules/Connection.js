export class Connection {
    constructor(fromNode, toNode, toSocketName, svgLayer) {
        this.from = fromNode; // Node
        this.to = toNode; // Node
        this.toSocketName = toSocketName;
        this.svg = svgLayer;
        this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.path.classList.add('connection-path');

        this.path.setAttribute('stroke', '#555');
        this.path.setAttribute('stroke-width', '2');
        this.path.setAttribute('fill', 'none');
        this.path.style.cursor = 'pointer';
        this.path.style.pointerEvents = 'auto'; // Ensure clickable even if svg is ignored

        this.svg.appendChild(this.path);

        // Click handler for selection
        this.path.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.app) window.app.selectConnection(this);
        });

        this.path.ondblclick = (e) => {
            e.stopPropagation();
            if (confirm('Delete connection?')) {
                if (window.app) window.app.removeConnection(this);
            }
        };

        this.path.onmouseover = () => {
            if (!this.path.classList.contains('selected')) {
                this.path.setAttribute('stroke', '#ff6b6b');
                this.path.setAttribute('stroke-width', '4');
            }
        };
        this.path.onmouseout = () => {
            if (!this.path.classList.contains('selected')) {
                this.path.setAttribute('stroke', '#555');
                this.path.setAttribute('stroke-width', '2');
            }
        };
    }

    update() {
        // Find specific output socket position (assuming single output for now)
        const outputSocket = this.from.outputsDiv.querySelector('.socket');
        let startX, startY;

        if (outputSocket) {
            const nodeRect = this.from.element.getBoundingClientRect();
            const socketRect = outputSocket.getBoundingClientRect();
            // Offset within node relative to node.x/y
            const offsetX = socketRect.left - nodeRect.left + (socketRect.width / 2);
            const offsetY = socketRect.top - nodeRect.top + (socketRect.height / 2);

            startX = this.from.x + offsetX;
            startY = this.from.y + offsetY;
        } else {
            startX = this.from.x + this.from.element.offsetWidth / 2;
            startY = this.from.y + this.from.element.offsetHeight; // Fallback
        }

        // Find specific input socket position
        let endX, endY;
        const socketEl = Array.from(this.to.inputsDiv.querySelectorAll('.socket'))
            .find(el => el.dataset.name === this.toSocketName);

        if (socketEl) {
            const nodeRect = this.to.element.getBoundingClientRect();
            const socketRect = socketEl.getBoundingClientRect();

            // Offset within node
            const offsetX = socketRect.left - nodeRect.left + (socketRect.width / 2);
            const offsetY = socketRect.top - nodeRect.top + (socketRect.height / 2);

            endX = this.to.x + offsetX;
            endY = this.to.y + offsetY;
        } else {
            // Fallback
            endX = this.to.x + this.to.element.offsetWidth / 2;
            endY = this.to.y;
        }

        // Bezier Curve
        const dx = Math.abs(endX - startX);
        const controlX = Math.max(dx * 0.5, 50);

        // const d = `M ${startX} ${startY} C ${startX + controlX} ${startY}, ${endX - controlX} ${endY}, ${endX} ${endY}`;
        // Using vertical curvature style from monolithic script:
        const d = `M ${startX} ${startY} C ${startX} ${startY + 50}, ${endX} ${endY - 50}, ${endX} ${endY}`;

        this.path.setAttribute('d', d);
    }

    select() {
        this.path.classList.add('selected');
    }

    deselect() {
        this.path.classList.remove('selected');
        this.path.setAttribute('stroke', '#555');
        this.path.setAttribute('stroke-width', '2');
    }

    remove() {
        if (this.path.parentNode) this.path.parentNode.removeChild(this.path);
    }
}
