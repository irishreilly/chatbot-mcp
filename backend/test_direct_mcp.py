#!/usr/bin/env python3
"""
Test direct MCP call to verify Docker container works
"""

import sys
import os
import asyncio
import logging

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_direct_mcp():
    """Test direct MCP call"""
    try:
        from services.simple_mcp_client import simple_mcp_client
        
        logger.info("Testing direct MCP call...")
        
        # Test a simple tool call
        result = await simple_mcp_client.call_tool("search_dashboards")
        
        logger.info(f"Tool call result:")
        logger.info(f"  Success: {result.success}")
        logger.info(f"  Tool: {result.tool_name}")
        
        if result.success:
            logger.info(f"  Result: {result.result}")
        else:
            logger.info(f"  Error: {result.error}")
        
        return result.success
        
    except Exception as e:
        logger.error(f"Direct MCP test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_direct_mcp())
    if success:
        print("✅ Direct MCP test passed")
    else:
        print("❌ Direct MCP test failed")
        sys.exit(1)