"""
AI usage helpers for token/cost logging.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import GEMINI_PRICE_INPUT_PER_1M_USD, GEMINI_PRICE_OUTPUT_PER_1M_USD


@dataclass
class UsageSnapshot:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0


def extract_usage_snapshot(response: Any) -> UsageSnapshot:
    """
    Extract token usage from Gemini response object.
    Supports both attribute and dict-style metadata payloads.
    """
    usage = getattr(response, "usage_metadata", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage_metadata")

    def _to_int(value: Any) -> int:
        try:
            numeric = int(value)
            return max(0, numeric)
        except Exception:
            return 0

    def _read_field(name: str, fallback: int = 0) -> int:
        if usage is None:
            return fallback
        if isinstance(usage, dict):
            return _to_int(usage.get(name, fallback))
        return _to_int(getattr(usage, name, fallback))

    input_tokens = _read_field("prompt_token_count")
    output_tokens = _read_field("candidates_token_count")
    total_tokens = _read_field("total_token_count", input_tokens + output_tokens)
    if total_tokens <= 0:
        total_tokens = input_tokens + output_tokens

    estimated_cost_usd = estimate_cost_usd(input_tokens, output_tokens)
    return UsageSnapshot(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost_usd,
    )


def estimate_cost_usd(input_tokens: int, output_tokens: int) -> float:
    """
    Estimate request cost using configured per-1M token rates.
    This is an estimate and should match your selected model pricing.
    """
    input_cost = (max(0, int(input_tokens)) / 1_000_000) * max(0.0, GEMINI_PRICE_INPUT_PER_1M_USD)
    output_cost = (max(0, int(output_tokens)) / 1_000_000) * max(0.0, GEMINI_PRICE_OUTPUT_PER_1M_USD)
    return round(input_cost + output_cost, 8)
