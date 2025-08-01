#!/usr/bin/env python3
"""
Manual test to verify chat service functionality
"""

import asyncio
from unittest.mock import Mock, AsyncMock
from backend.services.chat_service import ChatService
from backend.services.ai_service import AIService, AIResponse


async def test_chat_service_basic():
    """Test basic chat service functionality"""
    
    # Create mock AI service
    mock_ai_service = Mock(spec=AIService)
    mock_ai_service.generate_response = AsyncMock(return_value=AIResponse(
        content="Hello! How can I help you today?",
        provider="openai",
        model="gpt-3.5-turbo",
        tokens_used=15
    ))
    mock_ai_service.get_available_providers = Mock(return_value=['openai'])
    
    # Create chat service
    chat_service = ChatService(ai_service=mock_ai_service)
    
    # Test basic message processing
    result = await chat_service.process_message(
        message="Hello",
        conversation_id="test-123"
    )
    
    # Verify results
    assert result['response'] == "Hello! How can I help you today?"
    assert result['conversation_id'] == "test-123"
    assert result['mcp_tools_used'] == []
    assert result['ai_provider'] == "openai"
    assert result['ai_model'] == "gpt-3.5-turbo"
    assert result['tokens_used'] == 15
    assert 'timestamp' in result
    
    print("✅ Basic chat service test passed!")
    
    # Test MCP tool detection
    should_use, tools = await chat_service._should_use_mcp_tools("Please search for information")
    assert should_use is False  # No MCP manager
    assert tools == []
    
    print("✅ MCP tool detection test passed!")
    
    # Test health check
    health = await chat_service.health_check()
    assert health['chat_service'] is True
    assert health['ai_service'] is True
    assert health['mcp_service'] is False  # No MCP manager
    
    print("✅ Health check test passed!")
    
    print("🎉 All chat service tests passed!")


if __name__ == "__main__":
    asyncio.run(test_chat_service_basic())