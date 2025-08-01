#!/usr/bin/env python3

import sys
sys.path.append('.')

from backend.services.chat_service import ChatService
from backend.services.ai_service import AIService
from unittest.mock import Mock, AsyncMock

def test_chat_service_creation():
    """Simple test to verify ChatService can be created"""
    mock_ai_service = Mock(spec=AIService)
    chat_service = ChatService(ai_service=mock_ai_service)
    
    assert chat_service.ai_service == mock_ai_service
    assert chat_service.mcp_client_manager is None
    assert len(chat_service.tool_keywords) > 0
    print("✓ ChatService creation test passed")

if __name__ == "__main__":
    test_chat_service_creation()
    print("All tests passed!")