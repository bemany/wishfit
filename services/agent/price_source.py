"""One interface for the price data: PRICE_SOURCE=idealo (default, idealo MCP) or apify (test backend).
Three operations, named as the idealo MCP tools: search_products, get_product_offers, get_product_price_history.
Both sources return the internal format (see main._search_summary and friends)."""

import os

import apify
import idealo


def name() -> str:
    return "apify" if (os.environ.get("PRICE_SOURCE") or "idealo").lower() == "apify" else "idealo"


def trace_source() -> str:
    return "apify" if name() == "apify" else "live"


def configured() -> bool:
    if name() == "apify":
        return apify.configured()
    return bool(os.environ.get("IDEALO_MCP_URL") and os.environ.get("IDEALO_CLIENT_ID"))


def open_session() -> str | None:
    return None if name() == "apify" else idealo.open_session()


def call(tool: str, arguments: dict, session: str | None, timeout: float | None, summarize):
    """Result in the internal format. For idealo `summarize` turns the raw MCP answer into it; apify maps itself."""
    if name() == "apify":
        return apify.TOOLS[tool](arguments, timeout or 45)
    extra = {} if timeout is None else {"timeout": timeout}
    return summarize(idealo.call_tool(tool, arguments, session, **extra))
