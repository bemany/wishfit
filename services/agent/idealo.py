"""Minimal idealo MCP client: OAuth client-credentials token + JSON-RPC over streamable HTTP.
ponytail: plain httpx instead of the MCP SDK, one request per tool call, no session reuse."""
import json
import os
import time

import httpx

_token = {"value": None, "expires": 0.0}


def token() -> str:
    if _token["value"] and time.time() < _token["expires"] - 60:
        return _token["value"]
    r = httpx.post(
        os.environ["IDEALO_TOKEN_URL"],
        data={"grant_type": "client_credentials"},
        auth=(os.environ["IDEALO_CLIENT_ID"], os.environ["IDEALO_CLIENT_SECRET"]),
        timeout=20,
    )
    r.raise_for_status()
    d = r.json()
    _token.update(value=d["access_token"], expires=time.time() + d.get("expires_in", 3600))
    return _token["value"]


def rpc(method: str, params: dict | None = None, session: str | None = None, timeout: float = 30) -> tuple[dict, str | None]:
    headers = {"Authorization": f"Bearer {token()}", "Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    if session:
        headers["Mcp-Session-Id"] = session
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    r = httpx.post(os.environ["IDEALO_MCP_URL"], headers=headers, json=body, timeout=timeout)
    r.raise_for_status()
    text = r.text
    if "text/event-stream" in r.headers.get("content-type", ""):
        text = [line[5:].strip() for line in text.splitlines() if line.startswith("data:")][-1]
    return json.loads(text), r.headers.get("mcp-session-id")


def open_session() -> str | None:
    _, sid = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "wishloop-agent", "version": "0.1"}})
    return sid


def list_tools() -> list[dict]:
    sid = open_session()
    return rpc("tools/list", session=sid)[0]["result"]["tools"]


def call_tool(name: str, arguments: dict, session: str | None = None) -> dict:
    res = rpc("tools/call", {"name": name, "arguments": arguments}, session=session or open_session(), timeout=45)[0]
    if "error" in res:
        raise RuntimeError(res["error"].get("message", "idealo MCP error"))
    result = res["result"]
    if result.get("structuredContent") is not None:
        return result["structuredContent"]
    texts = [c.get("text", "") for c in result.get("content", []) if c.get("type") == "text"]
    try:
        return json.loads(texts[0]) if texts else {}
    except json.JSONDecodeError:
        return {"text": "\n".join(texts)}


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    for t in list_tools():
        print(f"\n## {t['name']}\n{t.get('description', '')}\n{json.dumps(t.get('inputSchema', {}), ensure_ascii=False)}")
