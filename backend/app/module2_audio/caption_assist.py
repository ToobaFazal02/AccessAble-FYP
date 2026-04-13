"""
Module 2: Caption Assist Service
AI-backed cue transformations for simplify, translate, and summarize flows.
"""

from __future__ import annotations

import asyncio
import json
from typing import Iterable

from google import genai

from app.config import GEMINI_API_KEY, MODEL_NAME
from app.logger import log_error, log_info, log_success


_assist_client = genai.Client(api_key=GEMINI_API_KEY)
_ASSIST_CHUNK_SIZE = 60


def _chunk_items(items: list[dict], size: int) -> Iterable[list[dict]]:
    """Yield evenly-sized chunks while preserving order."""
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _mode_instruction(mode: str, source_lang: str, target_lang: str) -> str:
    """Return mode-specific prompt guidance."""
    if mode == "simplify":
        return (
            "Rewrite every cue in simpler, clearer language for accessibility support. "
            "Keep the original meaning and do not add new facts."
        )
    if mode == "translate":
        return (
            f"Translate every cue from '{source_lang or 'und'}' into '{target_lang or 'en'}'. "
            "Keep names, URLs, and numbers accurate."
        )
    return (
        "Summarize each cue into a shorter caption-sized line while preserving the main idea. "
        "Keep the wording compact and readable."
    )


def _extract_json_object(raw_text: str) -> dict:
    """Extract a JSON object from plain text or fenced output."""
    text = str(raw_text or "").strip()
    if not text:
        raise ValueError("Empty AI response")

    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("AI response did not contain a JSON object")

    return json.loads(text[start:end + 1])


def _normalize_ai_cues(chunk: list[dict], ai_payload: dict) -> tuple[str, list[dict]]:
    """
    Merge AI output with the original timing metadata.

    We trust the model for text, but we always preserve the original cue timing
    and cue order so the extension overlay remains stable.
    """
    ai_cues = ai_payload.get("cues", []) if isinstance(ai_payload, dict) else []
    lang = str(ai_payload.get("lang", "")).strip().lower() if isinstance(ai_payload, dict) else ""

    normalized = []
    for index, original in enumerate(chunk):
        generated = ai_cues[index] if index < len(ai_cues) and isinstance(ai_cues[index], dict) else {}
        text = str(generated.get("text", "")).strip() or str(original.get("text", "")).strip()
        normalized.append({
            "start": float(original.get("start", 0)),
            "end": float(original.get("end", 0)),
            "text": text,
        })

    return lang, normalized


def _build_prompt(
    mode: str,
    cues: list[dict],
    source_lang: str,
    target_lang: str,
    page_url: str,
    video_url: str,
) -> str:
    """Build a strict JSON-only prompt for cue transformation."""
    instructions = _mode_instruction(mode, source_lang, target_lang)
    return f"""
You transform caption cues for an accessibility browser extension.

Task:
- Mode: {mode}
- Source language: {source_lang or 'und'}
- Target language: {target_lang or ''}
- Page URL: {page_url or ''}
- Video URL: {video_url or ''}

Rules:
- {instructions}
- Keep the exact same number of cues as the input.
- Preserve cue order.
- Do not leave any cue text empty.
- Return JSON only, with no markdown.
- Output schema:
  {{
    "lang": "<output-language-code>",
    "cues": [
      {{"start": 0.0, "end": 1.0, "text": "..." }}
    ]
  }}

Input cues JSON:
{json.dumps(cues, ensure_ascii=True)}
""".strip()


async def _transform_chunk(
    mode: str,
    chunk: list[dict],
    source_lang: str,
    target_lang: str,
    page_url: str,
    video_url: str,
) -> tuple[str, list[dict]]:
    """Transform a single cue chunk with Gemini."""

    prompt = _build_prompt(
        mode=mode,
        cues=chunk,
        source_lang=source_lang,
        target_lang=target_lang,
        page_url=page_url,
        video_url=video_url,
    )

    def _run_model():
        return _assist_client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )

    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(None, _run_model)
    payload = _extract_json_object(getattr(response, "text", ""))
    return _normalize_ai_cues(chunk, payload)


async def transform_caption_cues(
    mode: str,
    cues: list[dict],
    source_lang: str = "und",
    target_lang: str = "",
    page_url: str = "",
    video_url: str = "",
) -> dict:
    """
    Transform caption cues while preserving timing.

    Output shape matches the extension contract:
    {
      "mode": "...",
      "lang": "...",
      "cues": [...]
    }
    """
    if not cues:
        raise ValueError("At least one cue is required")

    log_info(f"[Module 2 Assist] Processing {len(cues)} cues with mode '{mode}'")

    transformed_cues = []
    resolved_lang = target_lang.strip().lower() if mode == "translate" else source_lang.strip().lower()

    try:
        for chunk in _chunk_items(cues, _ASSIST_CHUNK_SIZE):
            chunk_lang, chunk_result = await _transform_chunk(
                mode=mode,
                chunk=chunk,
                source_lang=source_lang,
                target_lang=target_lang,
                page_url=page_url,
                video_url=video_url,
            )
            if chunk_lang:
                resolved_lang = chunk_lang
            transformed_cues.extend(chunk_result)

        log_success(
            f"[Module 2 Assist] Completed mode '{mode}' for {len(transformed_cues)} cues"
        )

        return {
            "mode": mode,
            "lang": resolved_lang or source_lang or "und",
            "cues": transformed_cues,
            "provider": MODEL_NAME,
            "cached": False,
        }
    except Exception as e:
        log_error(f"[Module 2 Assist] Failed mode '{mode}': {e}")
        raise RuntimeError(str(e)) from e
