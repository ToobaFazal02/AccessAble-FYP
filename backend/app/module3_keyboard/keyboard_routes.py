"""
Module 3: Keyboard & Focus Accessibility - API Routes
Analytics and telemetry for keyboard navigation fixes
"""

from fastapi import APIRouter, HTTPException
from app.module3_keyboard.keyboard_schemas import KeyboardFixReport
from app.cache import cache
from app.metrics import METRICS
from app.logger import log_info, log_success, log_error
from datetime import datetime
import json


router = APIRouter(
    prefix="/api/v1/keyboard",
    tags=["Keyboard Accessibility"],
    responses={
        500: {"description": "Internal server error"},
        400: {"description": "Invalid request"}
    }
)


def _format_percent(count: int, total: int) -> str:
    """Return a rounded percentage string."""
    if total <= 0:
        return "0%"
    return f"{round((count / total) * 100)}%"


@router.post(
    "/track-fixes",
    summary="Track Accessibility Fixes",
    description="Record keyboard accessibility fixes applied by the browser extension",
    response_description="Confirmation of fix tracking with domain statistics"
)
async def track_fixes(report: KeyboardFixReport):
    """
    Track accessibility fixes applied by extension
    
    This endpoint aggregates data for thesis research:
    - Which websites need the most fixes
    - Which fix types are most commonly required
    - Impact metrics for the extension
    
    Args:
        report: KeyboardFixReport containing URL, domain, fixes applied
        
    Returns:
        Dictionary with tracking confirmation and domain statistics
        
    Raises:
        HTTPException: If tracking fails (status 500)
    """
    
    try:
        METRICS["total_requests"] += 1
        
        # Create Redis key for this domain
        key = f"keyboard_stats:{report.domain}"
        
        # Get existing stats or create new
        existing_stats = await cache.get(key)
        
        if existing_stats:
            # Handle both string (JSON) and dict from Redis
            stats = json.loads(existing_stats) if isinstance(existing_stats, str) else existing_stats
        else:
            stats = {
                "domain": report.domain,
                "total_visits": 0,
                "fixes": {},
                "first_seen": datetime.utcnow().isoformat(),
                "last_updated": None
            }
        
        # Increment visit counter
        stats["total_visits"] += 1
        stats["last_updated"] = datetime.utcnow().isoformat()
        
        # Increment individual fix counters
        for fix_type in report.fixes_applied:
            stats["fixes"][fix_type] = stats["fixes"].get(fix_type, 0) + 1
        
        # Store back in Redis with 30 day TTL (2592000 seconds)
        await cache.set(key, stats, ttl=2592000)
        
        log_success(f"Tracked fixes for {report.domain}: {', '.join(report.fixes_applied)}")
        
        return {
            "status": "recorded",
            "domain": report.domain,
            "total_visits_this_domain": stats["total_visits"],
            "message": f"Successfully recorded {len(report.fixes_applied)} fixes"
        }
    
    except Exception as e:
        METRICS["errors"] += 1
        log_error(f"Failed to track fixes: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to record fixes: {str(e)}"
        )


@router.get(
    "/analytics",
    summary="Get Aggregated Analytics",
    description="Returns aggregated statistics for thesis research and impact measurement",
    response_description="Analytics data with fix counts and top broken sites"
)
async def get_analytics():
    """
    Return aggregated analytics for research
    
    Use for thesis:
    - Extension analyzed X websites
    - Y percent needed skip link fixes
    - Top broken sites requiring most fixes
    
    Note: Currently returns basic metrics. Full aggregation requires
    Redis SCAN or PostgreSQL for production deployment.
    
    Returns:
        Dictionary containing analytics summary and sample insights
        
    Raises:
        HTTPException: If analytics retrieval fails (status 500)
    """
    
    try:
        reports = await cache.list_values("keyboard_stats:")

        total_sites_analyzed = len(reports)
        total_visits = 0
        total_fix_occurrences = 0
        domains_needing_skip_links = 0
        domains_needing_focus_fixes = 0
        domains_with_focus_traps = 0
        per_fix_totals = {}
        site_rankings = []

        for report in reports:
            fixes = report.get("fixes", {}) if isinstance(report, dict) else {}
            visits = int(report.get("total_visits", 0) or 0)
            non_zero_fix_types = [
                fix_type for fix_type, count in fixes.items()
                if isinstance(count, int) and count > 0
            ]
            fix_total_for_site = sum(
                count for count in fixes.values() if isinstance(count, int) and count > 0
            )

            total_visits += visits
            total_fix_occurrences += fix_total_for_site

            if fixes.get("skip_link", 0) > 0:
                domains_needing_skip_links += 1
            if fixes.get("focus_indicators", 0) > 0:
                domains_needing_focus_fixes += 1
            if fixes.get("focus_traps", 0) > 0:
                domains_with_focus_traps += 1

            for fix_type, count in fixes.items():
                if isinstance(count, int) and count > 0:
                    per_fix_totals[fix_type] = per_fix_totals.get(fix_type, 0) + count

            site_rankings.append({
                "domain": report.get("domain", "unknown"),
                "fixes_needed": len(non_zero_fix_types),
                "total_fix_occurrences": fix_total_for_site,
                "visits": visits,
            })

        most_broken_sites = sorted(
            site_rankings,
            key=lambda item: (
                item["fixes_needed"],
                item["total_fix_occurrences"],
                item["visits"],
                item["domain"],
            ),
            reverse=True,
        )[:5]

        top_fix_types = [
            {"fix_type": fix_type, "count": count}
            for fix_type, count in sorted(
                per_fix_totals.items(),
                key=lambda item: (-item[1], item[0]),
            )
        ]

        average_fixes_per_visit = round(
            total_fix_occurrences / total_visits,
            2,
        ) if total_visits > 0 else 0.0

        return {
            "service": "AccessAble Module 3 Analytics",
            "total_reports_received": METRICS.get("total_requests", 0),
            "cache_backend": cache.backend_name(),
            "insights": {
                "total_sites_analyzed": total_sites_analyzed,
                "total_visits_recorded": total_visits,
                "sites_needing_skip_links": _format_percent(
                    domains_needing_skip_links, total_sites_analyzed
                ),
                "sites_needing_focus_fixes": _format_percent(
                    domains_needing_focus_fixes, total_sites_analyzed
                ),
                "sites_with_focus_traps": _format_percent(
                    domains_with_focus_traps, total_sites_analyzed
                ),
                "average_fixes_per_visit": average_fixes_per_visit,
                "top_fix_types": top_fix_types,
                "most_broken_sites": most_broken_sites,
            },
            "methodology": (
                "Aggregated from cached extension reports submitted to "
                "/api/v1/keyboard/track-fixes"
            ),
        }
    
    except Exception as e:
        log_error(f"Analytics request failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve analytics: {str(e)}"
        )


@router.get(
    "/health",
    summary="Health Check",
    description="Verify Module 3 backend service is operational",
    response_description="Service health status"
)
async def health_check():
    """
    Simple health check endpoint
    
    Returns:
        Dictionary with service status and version info
    """
    return {
        "service": "AccessAble Module 3 - Keyboard Accessibility",
        "status": "operational",
        "version": "3.0.0",
        "features": [
            "Fix tracking",
            "Analytics aggregation",
            "Redis caching"
        ]
    }
