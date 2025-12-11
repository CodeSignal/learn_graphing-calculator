// app.js
import Modal from './design-system/components/modal/modal.js';

const status = document.getElementById('status');
let websocket = null;
let helpModal = null;

function setStatus(msg) {
  if (status) {
    status.textContent = msg;
  }
}

// Initialize WebSocket connection
function initializeWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws`;

  try {
    websocket = new WebSocket(wsUrl);

    websocket.onopen = function(event) {
      console.log('WebSocket connected');
      setStatus('Ready (WebSocket connected)');
    };

    websocket.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.message) {
          alert(data.message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = function(event) {
      console.log('WebSocket disconnected');
      setStatus('Ready (WebSocket disconnected)');

      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        initializeWebSocket();
      }, 3000);
    };

    websocket.onerror = function(error) {
      console.error('WebSocket error:', error);
      setStatus('Ready (WebSocket error)');
    };

  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    setStatus('Ready (WebSocket unavailable)');
  }
}

// Load help content and initialize modal
async function initializeHelpModal() {
  try {
    const response = await fetch('./help-content-template.html');
    const helpContent = await response.text();

    // Create help modal with actual content
    helpModal = Modal.createHelpModal({
      title: 'Help / User Guide',
      content: helpContent
    });

    // Bind help button click handler
    const helpButton = document.getElementById('btn-help');
    if (helpButton) {
      helpButton.addEventListener('click', () => {
        helpModal.open();
      });
    }

    setStatus('Ready');
  } catch (error) {
    console.error('Failed to load help content:', error);
    // Fallback to placeholder content
    helpModal = Modal.createHelpModal({
      title: 'Help / User Guide',
      content: '<p>Help content could not be loaded. Please check that help-content-template.html exists.</p>'
    });

    // Bind help button click handler
    const helpButton = document.getElementById('btn-help');
    if (helpButton) {
      helpButton.addEventListener('click', () => {
        helpModal.open();
      });
    }

    setStatus('Ready (help content unavailable)');
  }
}

// Initialize both help modal and WebSocket when DOM is ready
async function initialize() {
  await initializeHelpModal();
  initializeWebSocket();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
