/**
 * JavaScript logic for env setup page
 */

export function getJavaScripts(wsPort: number): string {
  return `
<script>
  let selectedEnvId = null;

  // Select environment
  function selectEnv(envId, element) {
    console.log('[env-setup] Selecting environment:', envId);
    selectedEnvId = envId;
    
    // Remove selected class from all items
    document.querySelectorAll('.env-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    // Add selected class to current item
    element.classList.add('selected');
    
    // Enable confirm button
    document.getElementById('confirmBtn').disabled = false;
  }

  // Filter environments
  function filterEnvs(searchTerm) {
    const items = document.querySelectorAll('.env-item');
    const searchClear = document.getElementById('searchClear');
    let visibleCount = 0;
    
    items.forEach(item => {
      const name = item.querySelector('.env-name').textContent.toLowerCase();
      const id = item.querySelector('.env-id').textContent.toLowerCase();
      const match = name.includes(searchTerm.toLowerCase()) || 
                   id.includes(searchTerm.toLowerCase());
      
      item.style.display = match ? 'flex' : 'none';
      if (match) visibleCount++;
    });
    
    // Show/hide clear button
    if (searchClear) {
      searchClear.style.display = searchTerm ? 'flex' : 'none';
    }
    
    // Show/hide no results message
    const noResults = document.getElementById('noResults');
    if (noResults) {
      const hasItems = items.length > 0;
      noResults.style.display = visibleCount === 0 && hasItems ? 'block' : 'none';
    }
  }

  // Clear search
  function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
      filterEnvs('');
      searchInput.focus();
    }
  }

  // WebSocket: same host as page so it works in remote VS Code / Cloud IDE (no localhost)
  const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = wsScheme + '//' + window.location.host;
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('[env-setup] WebSocket connected');
    // Send session ID to server to associate this WebSocket with the session
    const sessionId = window.location.pathname.split('/').pop();
    ws.send(JSON.stringify({
      type: 'registerSession',
      sessionId: sessionId
    }));
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('[env-setup] Received message:', data);
    
    if (data.type === 'success' && data.envId) {
      showSuccess(data.envId);
    } else if (data.type === 'envListRefreshed') {
      if (data.success) {
        console.log('[env-setup] Environment list refreshed, reloading page');
        // Reload the page to show updated environment list
        window.location.reload();
      } else {
        console.error('[env-setup] Failed to refresh environment list:', data.error);
        alert('刷新环境列表失败: ' + (data.error || '未知错误'));
      }
    }
  };

  ws.onerror = (error) => {
    console.error('[env-setup] WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('[env-setup] WebSocket closed');
  };

  // Show success state
  function showSuccess(envId) {
    document.querySelector('.content').style.display = 'none';
    const successState = document.getElementById('successState');
    const selectedEnvDisplay = document.getElementById('selectedEnvDisplay');
    
    if (successState && selectedEnvDisplay) {
      selectedEnvDisplay.textContent = envId;
      successState.style.display = 'block';
    }
  }

  // Confirm selection
  function confirm() {
    if (!selectedEnvId) {
      console.warn('[env-setup] No environment selected');
      return;
    }
    
    console.log('[env-setup] Confirming selection:', selectedEnvId);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'envId',
        data: selectedEnvId,
        cancelled: false
      }));
      
      // Close window immediately after sending confirmation
      setTimeout(() => {
        window.close();
      }, 100);
    } else {
      console.error('[env-setup] WebSocket not connected');
      alert('连接已断开，请刷新页面重试');
    }
  }

  // Cancel
  function cancel() {
    console.log('[env-setup] Cancelling');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'envId',
        data: null,
        cancelled: true
      }));
      
      // Close window immediately after sending cancellation
      setTimeout(() => {
        window.close();
      }, 100);
    }
  }

  // Switch account
  function switchAccount() {
    console.log('[env-setup] Switching account');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'envId',
        data: null,
        switch: true
      }));
      
      // Close window immediately after sending switch request
      setTimeout(() => {
        window.close();
      }, 100);
    }
  }

  // Universal URL opener - works with all IDEs including CodeBuddy
  async function openUrl(event, url) {
    if (event) {
      event.preventDefault();
    }
    
    console.log('[env-setup] Opening URL:', url);
    
    try {
      const response = await fetch('/api/open-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.error('[env-setup] Failed to open URL:', result.error);
        // Fallback to direct open if API fails
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('[env-setup] Error opening URL:', error);
      // Fallback to direct open if API fails
      window.open(url, '_blank');
    }
  }

  // Create new environment
  function createNewEnv() {
    console.log('[env-setup] Creating new environment');
    openUrl(null, 'https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp');
  }

  // Refresh environment list
  function refreshEnvList() {
    console.log('[env-setup] Refreshing environment list');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'refreshEnvList'
      }));
      
      // Add rotation animation
      const btn = event.target.closest('.btn-refresh');
      if (btn) {
        btn.style.transform = 'rotate(360deg)';
        setTimeout(() => {
          btn.style.transform = 'rotate(0deg)';
        }, 600);
      }
    }
  }

  // Retry init TCB
  function retryInitTcb(sessionId) {
    console.log('[env-setup] Retrying TCB initialization:', sessionId);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'retryInitTcb',
        sessionId: sessionId
      }));
    }
  }

  // Initialize on page load
  window.addEventListener('load', () => {
    // Auto-select first environment if exists
    const firstEnvItem = document.querySelector('.env-item');
    if (firstEnvItem && !selectedEnvId) {
      const envId = firstEnvItem.getAttribute('onclick')?.match(/selectEnv\\('([^']+)'/)?.[1];
      if (envId) {
        selectEnv(envId, firstEnvItem);
        console.log('[env-setup] Auto-selected first environment:', envId);
      }
    }
  });
</script>
  `.trim();
}

