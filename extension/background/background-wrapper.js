chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { command: command });
    }
  });
});


chrome.runtime.onInstalled.addListener(() => {
  console.log('AccessAble extension installed');
  chrome.storage.sync.set({
    speed: 1,
    pitch: 1,
    volume: 1,
    isReading: false
  });
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request.action);
  
  if (request.action === 'analyzeImageFromPage') {
    handleImageFromPage(request, sender, sendResponse);
    return true;
  }
  
  if (request.action === 'checkBackendConnection') {
    checkBackendConnection(sendResponse);
    return true;
  }
});


async function checkBackendConnection(sendResponse) {
  try {
    const response = await fetch('https://accessable-fyp.onrender.com/', {
      method: 'GET'
    });
    
    if (response.ok) {
      console.log('Backend connected');
      sendResponse({ connected: true, message: 'Backend is online' });
    } else {
      sendResponse({ connected: false, message: `Status: ${response.status}` });
    }
  } catch (error) {
    console.error('Backend check error:', error);
    sendResponse({ connected: false, message: error.message });
  }
}


async function handleImageFromPage(request, sender, sendResponse) {
  try {
    console.log('=== ANALYZING IMAGE FROM PAGE ===');
    console.log('Image URL:', request.imageUrl);
    console.log('Page URL:', request.pageUrl);
    
    const apiEndpoint = 'https://accessable-fyp.onrender.com/analyze-image';
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        image_url: request.imageUrl,
        page_url: request.pageUrl
      })
    });
    
    console.log('API Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    
    
    const contentType = response.headers.get('content-type');
    let description = '';
    
    if (contentType && contentType.includes('application/json')) {
      
      const result = await response.json();
      console.log('API Result (JSON):', result);
      
      
      description = result.description || result.analysis || result.result || result.message || 'No description available';
    } else {
      
      description = await response.text();
      console.log('API Result (Text):', description);
      
      
      if (description.startsWith('{') || description.startsWith('[')) {
        try {
          const parsed = JSON.parse(description);
          description = parsed.description || parsed.analysis || parsed.result || description;
        } catch (e) {
          
          console.log('Response looks like JSON but failed to parse, using as text');
        }
      }
    }
    
    
    description = description.replace(/^["']|["']$/g, ''); 
    description = description.replace(/\\n/g, ' '); 
    description = description.trim();
    
    console.log('Final cleaned description:', description);
    
    sendResponse({
      success: true,
      description: description,
      data: { description: description }
    });
    
  } catch (error) {
    console.error('=== IMAGE ANALYSIS ERROR ===');
    console.error('Error:', error);
    
    sendResponse({
      success: false,
      error: error.message,
      description: `Failed to analyze image: ${error.message}`
    });
  }
}