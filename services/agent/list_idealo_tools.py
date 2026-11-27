"""Print every tool of the idealo MCP (name, description, input schema).

Usage: uv run python list_idealo_tools.py
Env (or services/agent/.env): IDEALO_MCP_URL, optional IDEALO_MCP_TOKEN (sent as bearer).
Written against mcp 2.3.0 (mcp.Client + streamable_http_client).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client

load_dotenv(Path(__file__).parent / ".env")


async def main() -> None:
    url = os.environ.get("IDEALO_MCP_URL")
    if not url:
        sys.exit("IDEALO_MCP_URL is not set")
    token = os.environ.get("IDEALO_MCP_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else None
    async with create_mcp_http_client(headers=headers) as http:
        async with Client(streamable_http_client(url, http_client=http)) as client:
            cursor = None
            while True:
                page = await client.list_tools(cursor=cursor)
                for tool in page.tools:
                    print(f"\n## {tool.name}\n{tool.description or ''}")
                    print(json.dumps(tool.input_schema, indent=2, ensure_ascii=False))
                cursor = page.next_cursor
                if not cursor:
                    break


if __name__ == "__main__":
    asyncio.run(main())
