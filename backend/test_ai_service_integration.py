#!/usr/bin/env python3
"""
Test AI service with MCP integration
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.ai_service import AIService, AIProvider

async def test_ai_service_with_mcp():
    print('Testing AI service with MCP integration...')
    
    # Initialize AI service
    ai_service = AIService(provider=AIProvider.OPENAI)
    
    # Test a Grafana-related query
    query = "Show me the available dashboards in Grafana"
    
    try:
        response = await ai_service.generate_response(query)
        print(f'AI Response: {response.content[:500]}...')
        print(f'MCP Tools Used: {response.mcp_tools_used}')
        print(f'Provider: {response.provider}')
        print(f'Model: {response.model}')
        
    except Exception as e:
        print(f'Error: {e}')

if __name__ == "__main__":
    asyncio.run(test_ai_service_with_mcp())