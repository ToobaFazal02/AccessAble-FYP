"""
Metrics tracking 
"""

METRICS = {
    "total_requests": 0,
    "cache_hits": 0,
    "cache_misses": 0,
    "ai_calls": 0,
    "errors": 0,
    "avg_response_time": 0.0
}


def update_avg_response_time(new_latency: float):
    """Update average response time"""
    total = METRICS["total_requests"]
    current_avg = METRICS["avg_response_time"]
    METRICS["avg_response_time"] = round(
        (current_avg * (total - 1) + new_latency) / total, 2
    )