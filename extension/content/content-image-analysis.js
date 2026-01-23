// ============================================================================
// MODULE 1: AUTOMATIC IMAGE ACCESSIBILITY ANALYSIS
// Scans DOM for images missing alt text, requests AI descriptions, injects results
// ============================================================================

const IMG_MODULE = {
  isAnalyzing: false,
  processedImages: new Set(), // Track processed images by unique ID
  observerInstance: null
};

// ============================================================================
// PUBLIC API - Called from main content script
// ============================================================================

/**
 * Initialize automatic image analysis on page load
 */
function initImageAccessibilityModule() {
  console.log('[IMG Module] Initializing...');
  
  // Scan existing images
  scanAndAnalyzeImages();
  
  // Watch for dynamically added images (SPAs, lazy loading)
  observeDOMForNewImages();
}

/**
 * Manually trigger image analysis (can be called from popup/widget)
 */
function triggerManualImageAnalysis() {
  if (IMG_MODULE.isAnalyzing) {
    console.log('[IMG Module] Analysis already in progress');
    return;
  }
  scanAndAnalyzeImages();
}

/**
 * Stop all image analysis and cleanup
 */
function stopImageAnalysis() {
  if (IMG_MODULE.observerInstance) {
    IMG_MODULE.observerInstance.disconnect();
    IMG_MODULE.observerInstance = null;
  }
  IMG_MODULE.isAnalyzing = false;
  removeAllImageHighlights();
  console.log('[IMG Module] Stopped');
}

// ============================================================================
// CORE LOGIC - DOM Scanning & Image Detection
// ============================================================================

function scanAndAnalyzeImages() {
  if (IMG_MODULE.isAnalyzing) return;
  IMG_MODULE.isAnalyzing = true;
  
  console.log('[IMG Module] Scanning page for images...');
  
  // Find all img elements
  const allImages = document.querySelectorAll('img');
  const imagesToAnalyze = [];
  
  allImages.forEach((img, index) => {
    // Skip if:
    // - Explicitly decorative (role="presentation" or role="none")
    // - Already has valid alt text
    // - Already processed
    
    const role = img.getAttribute('role');
    const isDecorative = role === 'presentation' || role === 'none';
    
    const alt = img.getAttribute('alt');
    const hasValidAlt = alt !== null && alt.trim() !== '';
    
    const elementId = generateImageElementId(img, index);
    const alreadyProcessed = IMG_MODULE.processedImages.has(elementId);
    
    if (isDecorative || hasValidAlt || alreadyProcessed) {
      return; // Skip this image
    }
    
    // Valid target for analysis
    const src = img.src || img.getAttribute('data-src'); // Handle lazy loading
    
    if (!src || src.startsWith('data:')) {
      return; // Skip data URIs and empty sources
    }
    
    // Mark as needing analysis
    img.setAttribute('data-accessible-img-id', elementId);
    highlightMissingAltImage(img);
    
    imagesToAnalyze.push({
      elementId,
      url: src
    });
  });
  
  console.log(`[IMG Module] Found ${imagesToAnalyze.length} images needing alt text`);
  
  if (imagesToAnalyze.length === 0) {
    IMG_MODULE.isAnalyzing = false;
    return;
  }
  
  // Send batch request to background script
  chrome.runtime.sendMessage({
    action: 'analyzeImagesWithCaching',
    images: imagesToAnalyze,
    pageUrl: window.location.href
  }, (response) => {
    if (!response || !response.success) {
      console.error('[IMG Module] Batch analysis failed:', response?.error);
      IMG_MODULE.isAnalyzing = false;
      return;
    }
    
    console.log(`[IMG Module] Received ${response.results.length} results`);
    
    // Process results and inject alt text
    response.results.forEach((result) => {
      if (result.description) {
        injectAltText(result.elementId, result.description);
        IMG_MODULE.processedImages.add(result.elementId);
      }
    });
    
    IMG_MODULE.isAnalyzing = false;
  });
}

// ============================================================================
// DOM MUTATION OBSERVER - Detect dynamically added images
// ============================================================================

function observeDOMForNewImages() {
  if (IMG_MODULE.observerInstance) {
    return; // Already observing
  }
  
  const observer = new MutationObserver((mutations) => {
    let hasNewImages = false;
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IMG' || node.querySelector('img')) {
            hasNewImages = true;
          }
        }
      });
    });
    
    if (hasNewImages && !IMG_MODULE.isAnalyzing) {
      console.log('[IMG Module] New images detected, re-scanning...');
      setTimeout(() => scanAndAnalyzeImages(), 500); // Debounce
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  IMG_MODULE.observerInstance = observer;
  console.log('[IMG Module] DOM observer active');
}

// ============================================================================
// UI MANIPULATION - Highlighting & Alt Text Injection (CORRECTED)
// ============================================================================

function highlightMissingAltImage(img) {
  // Uses CSS selector [data-accessible-missing-alt="true"] from content.css
  img.setAttribute('data-accessible-missing-alt', 'true');
}

function removeHighlight(img) {
  img.removeAttribute('data-accessible-missing-alt');
}

function removeAllImageHighlights() {
  document.querySelectorAll('[data-accessible-missing-alt="true"]').forEach((img) => {
    removeHighlight(img);
  });
}

function injectAltText(elementId, description) {
  const img = document.querySelector(`[data-accessible-img-id="${elementId}"]`);
  
  if (!img) {
    console.warn(`[IMG Module] Image not found for ID: ${elementId}`);
    return;
  }
  
  // Inject alt text
  img.setAttribute('alt', description);
  
  // Remove red border
  removeHighlight(img);
  
  console.log(`[IMG Module] Alt text injected: ${description.substring(0, 50)}...`);
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateImageElementId(img, index) {
  // Create unique ID based on src + position
  const src = img.src || img.getAttribute('data-src') || '';
  const rect = img.getBoundingClientRect();
  return `img_${index}_${btoa(src + rect.top + rect.left).substring(0, 20)}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
  window.AccessAbleImageModule = {
    init: initImageAccessibilityModule,
    trigger: triggerManualImageAnalysis,
    stop: stopImageAnalysis
  };
}

function removeHighlight(img) {
  img.removeAttribute('data-accessible-missing-alt');
  
  img.style.border = 'none';
  img.style.outline = 'none';
  img.style.boxShadow = 'none';
  
  img.style.border = '2px solid #4CAF50'; 
}