// ============================================================================
// BACKGROUND SERVICE WORKER - Manifest V3
// Responsibilities: Backend communication, caching, command routing, throttling
// ============================================================================

const API_BASE = 'https://accessable-fyp.onrender.com';
const CACHE_KEY_PREFIX = 'img_alt_';

// 🔥 OPTIMIZATION CONFIGURATION (Free Tier Safe Mode)
// ----------------------------------------------------------------------------
const MAX_CONCURRENT_REQUESTS = 1;     // Strictly 1 request at a time
const REQUEST_DELAY_MS = 1000;         // 1 seconds rest after every API call
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// 1. INITIALIZATION & LISTENERS
// ============================================================================

// On Install/Update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AccessAble] Extension installed/updated');
  chrome.storage.sync.set({ speed: 1, pitch: 1, volume: 1 });
});

// Keyboard Commands (Alt+R, etc.)
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { command });
    }
  });
});

// Message Router (Central Hub)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Return true indicates we will respond asynchronously
  
  switch (request.action) {
    case 'analyzeImageFromPage':
      handleSingleImageAnalysis(request, sendResponse);
      return true; 
    
    case 'analyzeImagesWithCaching':
      handleBatchImageAnalysis(request, sendResponse);
      return true; 
    
    case 'checkBackendConnection':
      checkBackendConnection(sendResponse);
      return true; 
    
    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

// ============================================================================
// 2. CORE LOGIC - BATCH PROCESSING (The "Step-by-Step" Engine)
// ============================================================================
async function handleBatchImageAnalysis(request, sendResponse) {
  try {
    const { images, pageUrl } = request;
    if (!images || images.length === 0) {
      sendResponse({ success: true, results: [] });
      return;
    }

    console.log(`[BG] Processing ${images.length} images...`);
    const results = [];
    const queue = [...images];

    while (queue.length > 0) {
      const batch = queue.splice(0, MAX_CONCURRENT_REQUESTS);

      const batchPromises = batch.map(async (img) => {
        const cacheKey = generateCacheKey(img.url, pageUrl);
        
        // 1. Check Cache
        let description = await getFromCache(cacheKey);
        
        // 2. If Cache Miss, Call API
        if (!description) {
          try {
            description = await analyzeImageViaAPI(img.url, pageUrl);
            
            // SUCCESS: Save valid description
            await saveToCache(cacheKey, description);
            
            // Wait to save quota
            if (queue.length > 0) await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));

          } catch (error) {
            console.error(`[BG] Error for ${img.url}:`, error.message);
            
            // SMART FIX: Agar Image Kharab hai (400 Error), to usay "Unreadable" mark kar ke Cache kar lo.
            // Taake agli baar hum backend ko pareshan na karein.
            if (error.message.includes("400") || error.message.includes("cannot identify")) {
                description = "Image cannot be analyzed."; 
                await saveToCache(cacheKey, description);  // Save failure to prevent retry
            } else {
                description = null; // Retry later for other errors (like 500)
            }
          }
        } 
        
        return { elementId: img.elementId, url: img.url, description, fromCache: !!description };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    sendResponse({ success: true, results });

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// 3. SINGLE IMAGE LOGIC (Click-to-Analyze)
// ============================================================================

async function handleSingleImageAnalysis(request, sendResponse) {
  try {
    const { imageUrl, pageUrl } = request;
    const cacheKey = generateCacheKey(imageUrl, pageUrl);
    
    const cached = await getFromCache(cacheKey);
    if (cached) {
      sendResponse({ success: true, description: cached, fromCache: true });
      return;
    }
    
    const description = await analyzeImageViaAPI(imageUrl, pageUrl);
    await saveToCache(cacheKey, description);
    sendResponse({ success: true, description, fromCache: false });
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// 4. API & NETWORK HELPERS
// ============================================================================

async function checkBackendConnection(sendResponse) {
  try {
    const response = await fetch(`${API_BASE}/`, { method: 'GET' });
    sendResponse({ connected: response.ok, message: response.ok ? 'Online' : `Status: ${response.status}` });
  } catch (error) {
    sendResponse({ connected: false, message: error.message });
  }
}

async function analyzeImageViaAPI(imageUrl, pageUrl) {
  const response = await fetch(`${API_BASE}/analyze-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, page_url: pageUrl })
  });
  
  if (!response.ok) {
    // Agar Backend 400 deta hai (Bad Image), to hum error throw karenge
    if (response.status === 400) throw new Error("400 Bad Request: Image unreadable");
    if (response.status === 429) throw new Error("429 Quota Exceeded");
    
    throw new Error(`API Error ${response.status}`);
  }
  
  const result = await response.json();
  return result.description || 'No description';
}

// ============================================================================
// 5. CACHING HELPERS (Storage)
// ============================================================================

function generateCacheKey(imageUrl, pageUrl) {
  const uniquePart = imageUrl.slice(-100); 
  return `${CACHE_KEY_PREFIX}${btoa(uniquePart).replace(/=/g, '')}`; 
}

async function getFromCache(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const item = result[key];
      if (!item) return resolve(null);
      
      // Expiry Check
      if (Date.now() - item.timestamp > CACHE_EXPIRY_MS) {
        chrome.storage.local.remove([key]);
        return resolve(null);
      }
      resolve(item.description);
    });
  });
}

async function saveToCache(key, description) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [key]: { description, timestamp: Date.now() }
    }, resolve);
  });
}