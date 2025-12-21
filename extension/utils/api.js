const API_BASE_URL = 'https://accessable-fyp.onrender.com';

async function analyzeImage(imageUrl, pageUrl) {
  try {
    console.log('Analyzing image:', imageUrl);
    
    const endpoint = `${API_BASE_URL}/analyze_image/`; 
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        page_url: pageUrl
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Analysis result:', data);
    
    return {
      success: true,
      description: data.description || data.analysis || data.message || data.detail || 'No description available',
      data: data
    };
    
  } catch (error) {
    console.error('Error analyzing image:', error);
    return {
      success: false,
      error: error.message,
      description: 'Unable to analyze image. Please check your connection to the backend server.'
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeImage };
}