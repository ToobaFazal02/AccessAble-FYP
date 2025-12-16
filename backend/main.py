from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Initialize the App
app = FastAPI(title="AccessAble AI Backend", version="1.0")

# This defines the "Shape" of data Fatima MUST send you.
# If she sends something else, the server will reject it automatically.
class ImageRequest(BaseModel):
    image_url: str
    page_url: str

@app.get("/")
def health_check():
    """Simple check to see if server is running."""
    return {"status": "active", "module": "Image Accessibility"}

@app.post("/analyze-image")
async def analyze_image(request: ImageRequest):
    """
    Receives an image URL, (eventually) sends it to AI, and returns a description.
    """
    print(f"Received Request for: {request.image_url}")

    # --- PHASE 1: MOCK AI (To test connection) ---
    # We pretend to be AI for now to make sure Fatima's frontend works.
    # Later, we will replace this with real OpenAI/Google Vision code.

    fake_description = "A placeholder description of the image."

    return {
        "description": fake_description,
        "confidence": 0.99,
        "source": "mock_ai" 
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)