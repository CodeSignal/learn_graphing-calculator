/**
 * Sidebar Manager
 * Handles resizing and toggling of the sidebar.
 */
export default class SidebarManager {
    constructor(sidebarId, resizerId, toggleBtnId, floatingToggleBtnId) {
        this.sidebar = document.getElementById(sidebarId);
        this.resizer = document.getElementById(resizerId);
        this.toggleBtn = document.getElementById(toggleBtnId);
        this.floatingToggleBtn = document.getElementById(floatingToggleBtnId);

        this.isResizing = false;
        this.lastDownX = 0;
        this.minWidth = 250;
        this.maxWidth = 600; // Reasonable max width
        this.debug = false;
    }

    init() {
        if (!this.sidebar) {
            console.error('[SidebarManager] Sidebar element not found');
            return;
        }



        if (this.resizer) {
            this.resizer.addEventListener('mousedown', (e) => {
                this.isResizing = true;
                this.lastDownX = e.clientX;
                document.body.style.cursor = 'col-resize';
                e.preventDefault(); // Prevent text selection
            });
        }

        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => {
                this.toggle();
            });
        }

        if (this.floatingToggleBtn) {
            this.floatingToggleBtn.addEventListener('click', () => {
                this.toggle();
            });
        }

        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.handleMouseUp());
    }

    handleMouseMove(e) {
        if (!this.isResizing) return;

        // Calculate new width based on mouse position
        // e.clientX is roughly the width of the sidebar
        let newWidth = e.clientX;

        // Constrain
        if (newWidth < this.minWidth) newWidth = this.minWidth;
        if (newWidth > this.maxWidth) newWidth = this.maxWidth;

        if (this.debug) {
            console.log('[SidebarManager] Resizing to', newWidth);
        }
        this.sidebar.style.width = `${newWidth}px`;
        this.sidebar.style.flexBasis = `${newWidth}px`; // Force flex basis behavior



    }

    handleMouseUp() {
        if (this.isResizing) {
            this.isResizing = false;
            document.body.style.cursor = 'default';
        }
    }

    toggle() {
        this.sidebar.classList.toggle('collapsed');
        const isCollapsed = this.sidebar.classList.contains('collapsed');

        // Show/hide floating button based on collapsed state
        if (this.floatingToggleBtn) {
            if (isCollapsed) {
                this.floatingToggleBtn.classList.add('visible');
            } else {
                this.floatingToggleBtn.classList.remove('visible');
            }
        }
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebug(enabled) {
        this.debug = enabled;
    }
}
