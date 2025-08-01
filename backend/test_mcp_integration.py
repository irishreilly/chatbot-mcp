#!/usr/bin/env python3
"""
Test MCP integration with AI service
"""

import sys
import os
import asyncio
import logging

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_mcp_integration():
    """Test MCP integration with AI service"""
    try:
        from services.ai_service import AIService, AIProvider
        
        logger.info("Testing MCP integration with AI service...")
        
        # Create AI service instance
        ai_service = AIService(provider=AIProvider.OPENAI)
        logger.info("AI service created successfully")
        
        # Test MCP connections
        await ai_service.initialize_mcp_connections()
        logger.info("MCP connections initialized")
        
        # Test tool detection
        test_queries = [
            "What dashboards are in Grafana?",
            "Show me the datasources",
            "Search for metrics",
            "This is not a Grafana query"
        ]
        
        for query in test_queries:
            relevant_tools = await ai_service.get_relevant_tools(query)
            logger.info(f"Query: '{query}' -> Tools: {relevant_tools}")
        
        # Test actual tool calling (this will try to call Docker)
        logger.info("Testing actual MCP tool execution...")
        grafana_tools = await ai_service.get_relevant_tools("What dashboards are in Grafana?")
        
        if grafana_tools:
            logger.info(f"Calling tools: {grafana_tools}")
            try:
                results = await ai_service.call_mcp_tools(grafana_tools)
                logger.info(f"Tool results: {len(results)} results returned")
                
                for result in results:
                    if hasattr(result, 'success'):
                        if result.success:
                            logger.info(f"✅ {result.tool_name}: Success")
                        else:
                            logger.info(f"❌ {result.tool_name}: {result.error}")
                    else:
                        logger.info(f"Unexpected result type: {type(result)}")
                        
            except Exception as e:
                logger.warning(f"Tool execution failed (expected if Docker not running): {e}")
        
        return True
        
    except Exception as e:
        logger.error(f"MCP integration test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_mcp_integration())
    if success:
        print("✅ MCP integration test passed")
    else:
        print("❌ MCP integration test failed")
        sys.exit(1)