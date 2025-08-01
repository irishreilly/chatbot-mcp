#!/usr/bin/env python3
"""
Test timeout behavior for MCP integration
"""

import asyncio
import sys
import os
import time
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.simple_mcp_client import simple_mcp_client
from services.ai_service import AIService, AIProvider
from config import settings

async def test_timeout_configurations():
    print('Testing timeout configurations...')
    print(f'AI Service Timeout: {settings.ai_service_timeout} seconds')
    print(f'MCP Client Timeout: {settings.mcp_client_timeout} seconds')
    
    # Test MCP client timeout behavior
    print('\nTesting MCP client...')
    start_time = time.time()
    
    try:
        result = await simple_mcp_client.call_tool('search_dashboards')
        elapsed = time.time() - start_time
        print(f'MCP call completed in {elapsed:.2f} seconds')
        print(f'Success: {result.success}')
        if result.success:
            print(f'Result length: {len(str(result.result))} characters')
        else:
            print(f'Error: {result.error}')
    except Exception as e:
        elapsed = time.time() - start_time
        print(f'MCP call failed after {elapsed:.2f} seconds: {e}')
    
    # Test AI service timeout behavior
    print('\nTesting AI service...')
    start_time = time.time()
    
    try:
        ai_service = AIService(provider=AIProvider.OPENAI)
        response = await ai_service.generate_response("Show me Grafana dashboards")
        elapsed = time.time() - start_time
        print(f'AI service call completed in {elapsed:.2f} seconds')
        print(f'MCP tools used: {response.mcp_tools_used}')
        print(f'Response length: {len(response.content)} characters')
    except Exception as e:
        elapsed = time.time() - start_time
        print(f'AI service call failed after {elapsed:.2f} seconds: {e}')

if __name__ == "__main__":
    asyncio.run(test_timeout_configurations())