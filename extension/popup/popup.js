let isReading = false;
let isPaused = false;
let isImageMode = false;

console.log('Popup script loaded');


chrome.storage.sync.get(['speed', 'pitch', 'volume', 'isReading', 'isPaused', 'isImageMode'], (data) => {
  console.log('Loaded settings:', data);
  if (data.speed) {
    document.getElementById('speed').value = data.speed;
    document.getElementById('speedValue').textContent = data.speed + 'x';
  }
  if (data.pitch) {
    document.getElementById('pitch').value = data.pitch;
    document.getElementById('pitchValue').textContent = data.pitch + 'x';
  }
  if (data.volume !== undefined) {
    document.getElementById('volume').value = data.volume;
    document.getElementById('volumeValue').textContent = Math.round(data.volume * 100) + '%';
  }
  if (data.isReading) {
    isReading = data.isReading;
    updateReaderButton();
  }
  if (data.isPaused) {
    isPaused = data.isPaused;
    updatePauseButton();
  }
  if (data.isImageMode) {
    isImageMode = data.isImageMode;
    updateImageModeButton();
  }
});

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch (error) {
    console.log('Content script not found, injecting...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content/content.css']
      });
      console.log('Content script injected successfully');
      return true;
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
      return false;
    }
  }
}


document.getElementById('toggleReader').addEventListener('click', async () => {
  console.log('Toggle button clicked');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab);
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      updateStatus('Cannot run on Chrome pages');
      return;
    }
    
    const scriptReady = await ensureContentScript(tab.id);
    
    if (!scriptReady) {
      updateStatus('Failed to load content script');
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    chrome.tabs.sendMessage(tab.id, { action: 'toggleReader' }, (response) => {
      console.log('Response from content script:', response);
      
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        updateStatus('Error: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response) {
        isReading = response.isReading;
        isPaused = false;
        updateReaderButton();
        updatePauseButton();
        updateStatus(isReading ? 'Reading...' : 'Stopped');
      }
    });
  } catch (error) {
    console.error('Error in toggle:', error);
    updateStatus('Error: ' + error.message);
  }
});


document.getElementById('toggleImageMode').addEventListener('click', async () => {
  console.log('Toggle image mode clicked');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      updateStatus('Cannot run on Chrome pages');
      return;
    }
    
    const scriptReady = await ensureContentScript(tab.id);
    
    if (!scriptReady) {
      updateStatus('Failed to load content script');
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    chrome.tabs.sendMessage(tab.id, { action: 'toggleImageMode' }, (response) => {
      console.log('Image mode response:', response);
      
      if (chrome.runtime.lastError) {
        console.error('Error:', chrome.runtime.lastError);
        updateStatus('Error: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response) {
        isImageMode = response.isImageMode;
        updateImageModeButton();
        updateStatus(isImageMode ? 'Image mode active - Click images' : 'Image mode disabled');
      }
    });
  } catch (error) {
    console.error('Error in toggle image mode:', error);
    updateStatus('Error: ' + error.message);
  }
});


document.getElementById('pauseResume').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'pauseResume' }, (response) => {
    if (response) {
      isPaused = response.isPaused;
      updatePauseButton();
      updateStatus(isPaused ? 'Paused' : 'Reading...');
    }
  });
});


document.getElementById('speed').addEventListener('input', (e) => {
  const value = e.target.value;
  document.getElementById('speedValue').textContent = value + 'x';
  chrome.storage.sync.set({ speed: parseFloat(value) });
  sendSettingUpdate('speed', parseFloat(value));
});


document.getElementById('pitch').addEventListener('input', (e) => {
  const value = e.target.value;
  document.getElementById('pitchValue').textContent = value + 'x';
  chrome.storage.sync.set({ pitch: parseFloat(value) });
  sendSettingUpdate('pitch', parseFloat(value));
});


document.getElementById('volume').addEventListener('input', (e) => {
  const value = e.target.value;
  document.getElementById('volumeValue').textContent = Math.round(value * 100) + '%';
  chrome.storage.sync.set({ volume: parseFloat(value) });
  sendSettingUpdate('volume', parseFloat(value));
});


function updateReaderButton() {
  const button = document.getElementById('toggleReader');
  const status = document.getElementById('readerStatus');
  const pauseBtn = document.getElementById('pauseResume');
  
  if (isReading) {
    button.classList.add('active');
    status.textContent = 'Stop Reading';
    pauseBtn.style.display = 'block';
  } else {
    button.classList.remove('active');
    status.textContent = 'Start Reading';
    pauseBtn.style.display = 'none';
  }
}

function updateImageModeButton() {
  const button = document.getElementById('toggleImageMode');
  const status = document.getElementById('imageModeStatus');
  
  if (isImageMode) {
    button.classList.add('active');
    status.textContent = 'Disable Image Mode';
  } else {
    button.classList.remove('active');
    status.textContent = 'Enable Image Mode';
  }
}

function updatePauseButton() {
  const pauseBtn = document.getElementById('pauseResume');
  const pauseStatus = document.getElementById('pauseStatus');
  
  if (isPaused) {
    pauseStatus.textContent = 'Resume';
  } else {
    pauseStatus.textContent = 'Pause';
  }
}

function updateStatus(message) {
  console.log('Status update:', message);
  document.getElementById('statusText').textContent = message;
}

async function sendSettingUpdate(setting, value) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }
    
    chrome.tabs.sendMessage(tab.id, { 
      action: 'updateSetting', 
      setting: setting, 
      value: value 
    });
  } catch (error) {
    console.error('Error sending setting update:', error);
  }
}


(async function checkBackend() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'checkBackendConnection' 
    });
    
    if (!response.connected) {
      const statusEl = document.getElementById('statusText');
      statusEl.innerHTML = 'Backend not connected';
      statusEl.style.color = '#ff6b6b';
    } else {
      const statusEl = document.getElementById('statusText');
      statusEl.innerHTML = 'Backend connected ✓';
      statusEl.style.color = '#9FE0E5';
    }
  } catch (error) {
    console.log('Backend check failed:', error);
  }
})();