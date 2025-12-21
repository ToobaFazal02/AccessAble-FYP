let isReading = false;
let isPaused = false;
let isImageMode = false;
let currentIndex = 0;
let readableElements = [];
let imageClickHandler = null;
let speechSettings = {
  speed: 1,
  pitch: 1,
  volume: 1
};
let widget = null;

console.log('Content script loaded');

chrome.storage.sync.get(['speed', 'pitch', 'volume'], (data) => {
  if (data.speed) speechSettings.speed = data.speed;
  if (data.pitch) speechSettings.pitch = data.pitch;
  if (data.volume !== undefined) speechSettings.volume = data.volume;
  console.log('Settings loaded:', speechSettings);
});

//keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Alt+R = Toggle Reader
  if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    toggleReader();
  }
  // Alt+S = Pause/Resume
  else if (e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    pauseResume();
  }
  // Alt+N = Read Next
  else if (e.altKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    readNext();
  }
  // Alt+P = Read Previous
  else if (e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    readPrevious();
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  
  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  } else if (request.action === 'toggleReader') {
    toggleReader();
    sendResponse({ isReading: isReading });
  } else if (request.action === 'pauseResume') {
    pauseResume();
    sendResponse({ isPaused: isPaused });
  } else if (request.action === 'readNext') {
    readNext();
    sendResponse({ success: true });
  } else if (request.action === 'readPrevious') {
    readPrevious();
    sendResponse({ success: true });
  } else if (request.action === 'updateSetting') {
    speechSettings[request.setting] = request.value;
    sendResponse({ success: true });
  } else if (request.action === 'toggleImageMode') {
    toggleImageMode();
    sendResponse({ isImageMode: isImageMode });
  } else if (request.command) {
    if (request.command === 'toggle-reader') {
      toggleReader();
    } else if (request.command === 'read-next') {
      readNext();
    } else if (request.command === 'read-previous') {
      readPrevious();
    } else if (request.command === 'pause-resume') {
      pauseResume();
    }
    sendResponse({ success: true });
  }
  return true;
});

//Image mode
function toggleImageMode() {
  isImageMode = !isImageMode;
  
  if (isImageMode) {
    enableImageClickMode();
    speak("Image mode enabled. Click on any image to get an AI description.");
  } else {
    disableImageClickMode();
    speak("Image mode disabled.");
  }
  
  console.log('Image mode:', isImageMode);
}

function enableImageClickMode() {
  if (imageClickHandler) {
    disableImageClickMode();
  }
  
  imageClickHandler = (e) => {
    if (isImageMode && e.target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      
      const img = e.target;
      const imgUrl = img.src;
      
      if (!imgUrl || imgUrl.startsWith('data:')) {
        speak("Cannot analyze this image. Please try a different image.");
        return;
      }
      
      img.classList.add('accessible-ai-highlight');
      
      speak("Analyzing image...");
      
      chrome.runtime.sendMessage({
        action: 'analyzeImageFromPage',
        imageUrl: imgUrl,
        pageUrl: window.location.href
      }, (response) => {
        if (response && response.success) {
          speak("Image description: " + response.description);
          updateWidgetStatus('Image: ' + response.description.substring(0, 50) + '...');
        } else {
          const errorMsg = response ? response.error : 'No response from server';
          speak("Failed to analyze image: " + errorMsg);
        }
        
        setTimeout(() => {
          img.classList.remove('accessible-ai-highlight');
        }, 3000);
      });
    }
  };
  
  document.addEventListener('click', imageClickHandler, true);

  document.querySelectorAll('img').forEach(img => {
    img.style.cursor = 'pointer';
    img.title = 'Click for AI description';
  });
}

function disableImageClickMode() {
  if (imageClickHandler) {
    document.removeEventListener('click', imageClickHandler, true);
    imageClickHandler = null;
  }

  document.querySelectorAll('img').forEach(img => {
    img.style.cursor = '';
    img.title = '';
    img.classList.remove('accessible-ai-highlight');
  });
}

//widget 
function createWidget() {
  if (widget) return;
  
  widget = document.createElement('div');
  widget.id = 'accessible-widget';
  widget.innerHTML = `
    <div id="accessible-widget-header">
      <span id="accessible-widget-title">AccessAble</span>
      <button id="accessible-widget-close" aria-label="Close widget">×</button>
    </div>
    <div id="accessible-widget-status">Ready</div>
    <div id="accessible-widget-controls">
      <button class="accessible-widget-btn" id="widget-pause">Pause</button>
      <button class="accessible-widget-btn" id="widget-prev">Previous</button>
      <button class="accessible-widget-btn" id="widget-next">Next</button>
    </div>
    
    
<div id="accessible-widget-shortcuts">
  <div id="accessible-widget-shortcuts-grid">
    <div class="shortcut-item">
      <span class="accessible-widget-kbd">Alt+R</span>
      <span class="shortcut-label">Toggle</span>
    </div>
    <div class="shortcut-item">
      <span class="accessible-widget-kbd">Alt+S</span>
      <span class="shortcut-label">Pause</span>
    </div>
    <div class="shortcut-item">
      <span class="accessible-widget-kbd">Alt+N</span>
      <span class="shortcut-label">Next</span>
    </div>
    <div class="shortcut-item">
      <span class="accessible-widget-kbd">Alt+P</span>
      <span class="shortcut-label">Prev</span>
    </div>
  </div>
</div>
  `;
  
  document.body.appendChild(widget);
  attachWidgetListeners();
}

function attachWidgetListeners() {
  console.log('Attaching widget listeners...');
  const closeBtn = document.getElementById('accessible-widget-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      console.log('Close button clicked');
      isReading = false;
      stopReading();
      removeWidget();
    };
  }
  
  const pauseBtn = document.getElementById('widget-pause');
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      console.log('Pause button clicked');
      pauseResume();
    };
  }
  
  const prevBtn = document.getElementById('widget-prev');
  if (prevBtn) {
    prevBtn.onclick = () => {
      console.log('Previous button clicked');
      readPrevious();
    };
  }
 
  const nextBtn = document.getElementById('widget-next');
  if (nextBtn) {
    nextBtn.onclick = () => {
      console.log('Next button clicked');
      readNext();
    };
  }
  
  console.log('Widget listeners attached successfully');
}

function removeWidget() {
  if (widget) {
    widget.remove();
    widget = null;
    console.log('Widget removed');
  }
}

function updateWidgetStatus(status) {
  if (widget) {
    const statusEl = document.getElementById('accessible-widget-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }
}

function updateWidgetPauseButton() {
  if (widget) {
    const pauseBtn = document.getElementById('widget-pause');
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
      if (isPaused) {
        pauseBtn.classList.add('active');
      } else {
        pauseBtn.classList.remove('active');
      }
    }
  }
}

//screen reader functions
function toggleReader() {
  console.log('Toggle reader called, current state:', isReading);
  
  if (isReading) {
    isReading = false;
    stopReading();
    removeWidget();
    chrome.storage.sync.set({ isReading: false, isPaused: false });
  } else {
    isReading = true;
    isPaused = false;
    createWidget();
    startReading();
    chrome.storage.sync.set({ isReading: true, isPaused: false });
  }
}

function pauseResume() {
  if (!isReading) {
    speak("Screen reader is not active. Press Alt+R to start.");
    return;
  }
  
  isPaused = !isPaused;
  
  if (isPaused) {
    window.speechSynthesis.pause();
    updateWidgetStatus('Paused');
    console.log('Reading paused');
  } else {
    window.speechSynthesis.resume();
    updateWidgetStatus('Reading...');
    console.log('Reading resumed');
  }
  
  updateWidgetPauseButton();
  chrome.storage.sync.set({ isPaused: isPaused });
}

function startReading() {
  console.log('Starting to read...');
  readableElements = getReadableElements();
  currentIndex = 0;
  
  console.log('Found readable elements:', readableElements.length);
  
  updateWidgetStatus('Reading...');
  
  if (readableElements.length > 0) {
    readElement(readableElements[currentIndex]);
  } else {
    speak("No readable content found on this page.");
    isReading = false;
    removeWidget();
  }
}

function stopReading() {
  console.log('Stopping reading...');
  window.speechSynthesis.cancel();
  removeHighlight();
  currentIndex = 0;
  isPaused = false;
}

function getReadableElements() {
  const mainContent = findMainContent();
  
  if (mainContent) {
    console.log('Found main content area:', mainContent);
    return getElementsFromContainer(mainContent);
  }
  
  return getElementsFromContainer(document.body);
}

function findMainContent() {
  const mainSelectors = [
    'main',
    '[role="main"]',
    '#content',
    '#main-content',
    '.main-content',
    'article',
    '#mw-content-text',
    '.mw-parser-output'
  ];
  
  for (const selector of mainSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  
  return null;
}

function getElementsFromContainer(container) {
  const allElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote');
  
  const skipSelectors = [
    'nav',
    'header:not(article header)',
    'footer:not(article footer)',
    '.navigation',
    '.nav',
    '.menu',
    '.sidebar',
    '.ad',
    '.advertisement',
    '#toc',
    '.toc',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.mw-jump-link',
    '#siteSub',
    '#contentSub',
    '.navbox',
    '.reflist',
    '.printfooter',
    '.noprint',
    '#catlinks',
    '.catlinks',
    '.mw-editsection',
    '#mw-navigation',
    '#mw-panel'
  ];
  
  const readableElements = [];
  
  Array.from(allElements).forEach(el => {
    const text = el.innerText?.trim();
    if (!text || text.length === 0) return;
    
    if (!isVisible(el)) return;
    
    if (isInSkipArea(el, skipSelectors)) return;
    
    const tagName = el.tagName.toLowerCase();
    
    if (tagName.match(/^h[1-6]$/)) {
      if (!isNavigationElement(el, text)) {
        readableElements.push(el);
      }
    } else if (tagName === 'p' || tagName === 'blockquote') {
      if (text.length < 10) {
        if (isNavigationElement(el, text)) return;
      }
      readableElements.push(el);
    }
  });
  
  readableElements.sort((a, b) => {
    const posA = a.getBoundingClientRect().top + window.scrollY;
    const posB = b.getBoundingClientRect().top + window.scrollY;
    return posA - posB;
  });
  
  return readableElements;
}

function isInSkipArea(element, skipSelectors) {
  for (const selector of skipSelectors) {
    if (element.closest(selector)) {
      return true;
    }
  }
  return false;
}

function isNavigationElement(element, text) {
  const navKeywords = [
    'log in', 'sign in', 'sign up', 'register', 'create account',
    'talk', 'contributions', 'preferences', 'watchlist',
    'edit', 'history', 'view source', 'read', 'view history',
    'main page', 'contents', 'current events', 'random article',
    'about', 'contact us', 'donate', 'help', 'learn to edit',
    'community portal', 'recent changes', 'upload file'
  ];
  
  const lowerText = text.toLowerCase().trim();
  
  for (const keyword of navKeywords) {
    if (lowerText === keyword) {
      return true;
    }
  }
  
  if (text.length < 20) {
    for (const keyword of navKeywords) {
      if (lowerText.includes(keyword)) {
        return true;
      }
    }
  }
  
  return false;
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0' &&
         element.offsetWidth > 0 &&
         element.offsetHeight > 0;
}

function readElement(element) {
  if (!element || !isReading) return;
  
  console.log('Reading element:', element.tagName, element.innerText.substring(0, 50));
  
  removeHighlight();
  highlightElement(element);
  
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  const text = getElementText(element);
  updateWidgetStatus(`Reading: ${element.tagName}`);
  
  speak(text, () => {
    if (isReading && currentIndex < readableElements.length - 1) {
      currentIndex++;
      readElement(readableElements[currentIndex]);
    } else {
      isReading = false;
      removeHighlight();
      updateWidgetStatus('Complete');
      chrome.storage.sync.set({ isReading: false });
      speak("Reading complete.");
      setTimeout(() => {
        removeWidget();
      }, 2000);
    }
  });
}

function getElementText(element) {
  const tagName = element.tagName.toLowerCase();
  
  let text = element.innerText.trim();
  
  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/\[edit\]/gi, '');
  text = text.replace(/\[citation needed\]/gi, '');
  
  text = text.replace(/\s+/g, ' ').trim();
  
  if (tagName === 'h1') {
    return `Title: ${text}`;
  } else if (tagName === 'h2') {
    return `Section: ${text}`;
  } else if (tagName.match(/^h[3-6]$/)) {
    return `Subsection: ${text}`;
  } else if (tagName === 'blockquote') {
    return `Quote: ${text}`;
  } else {
    return text;
  }
}

function speak(text, onEnd) {
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = speechSettings.speed;
  utterance.pitch = speechSettings.pitch;
  utterance.volume = speechSettings.volume;
  
  if (onEnd) {
    utterance.onend = onEnd;
  }
  
  console.log('Speaking:', text.substring(0, 100) + '...');
  window.speechSynthesis.speak(utterance);
}

function highlightElement(element) {
  element.classList.add('accessible-highlight');
  element.setAttribute('data-accessible-reading', 'true');
}

function removeHighlight() {
  const highlighted = document.querySelectorAll('[data-accessible-reading="true"]');
  highlighted.forEach(el => {
    el.classList.remove('accessible-highlight');
    el.removeAttribute('data-accessible-reading');
  });
}

function readNext() {
  if (!isReading) {
    speak("Screen reader is not active. Press Alt+R to start.");
    return;
  }
  
  if (readableElements.length === 0) {
    readableElements = getReadableElements();
  }
  
  if (currentIndex < readableElements.length - 1) {
    window.speechSynthesis.cancel();
    currentIndex++;
    isPaused = false;
    updateWidgetPauseButton();
    readElement(readableElements[currentIndex]);
  } else {
    speak("This is the last element.");
  }
}

function readPrevious() {
  if (!isReading) {
    speak("Screen reader is not active. Press Alt+R to start.");
    return;
  }
  
  if (readableElements.length === 0) {
    readableElements = getReadableElements();
  }
  
  if (currentIndex > 0) {
    window.speechSynthesis.cancel();
    currentIndex--;
    isPaused = false;
    updateWidgetPauseButton();
    readElement(readableElements[currentIndex]);
  } else {
    speak("This is the first element.");
  }
}