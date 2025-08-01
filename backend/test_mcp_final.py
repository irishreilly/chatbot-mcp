#!/usr/bin/env python3
"""
Final test of MCP integration
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.simple_mcp_client import simple_mcp_client

async def test_mcp():
    print('Testing MCP integration...')
    
    # Test if query is recognized as Grafana-related
    is_grafana = await simple_mcp_client.is_grafana_query('show me dashboards')
    print(f'Is Grafana query: {is_grafana}')
    
    # Test getting relevant tools
    tools = await simple_mcp_client.get_relevant_tools('show me dashboards')
    print(f'Relevant tools: {tools}')
    
    # Test calling a tool
    result = await simple_mcp_client.call_tool('search_dashboards')
    print(f'Tool result success: {result.success}')
    if result.success:
        print(f'Result: {result.result}')
    else:
        print(f'Error: {result.error}')

if __name__ == "__main__":
    asyncio.run(test_mcp())