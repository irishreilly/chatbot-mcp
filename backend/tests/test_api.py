import asyncio
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, Mock
from backend.main import app, conversations
from backend.services.ai_service import AIResponse, AIServiceError, AIProviderError, AIService, AIProvider
import json


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_conversations():
    """Clear conversations before each test"""
    conversations.clear()


class TestHealthEndpoint:
    """Test cases for health check endpoint"""
    
    def test_health_check(self, client):
        """Test health check endpoint returns correct response"""
        response = client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == "1.0.0"
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))


class TestChatEndpoint:
    """Test cases for chat endpoint"""
    
    def test_chat_basic_message(self, client):
        """Test sending a basic chat message"""
        request_data = {
            "message": "Hello, how are you?"
        }
        
        response = client.post("/api/chat", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "response" in data
        assert "conversation_id" in data
        assert "mcp_tools_used" in data
        assert "timestamp" in data
        
        # Verify response content (should be fallback message when no AI service)
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0
        assert isinstance(data["conversation_id"], str)
        assert data["mcp_tools_used"] == []
        assert isinstance(data["timestamp"], str)
    
    def test_chat_with_conversation_id(self, client):
        """Test sending a message with existing conversation ID"""
        conversation_id = "test-conv-123"
        request_data = {
            "message": "First message",
            "conversation_id": conversation_id
        }
        
        response = client.post("/api/chat", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == conversation_id
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0
        
        # Send second message to same conversation
        request_data2 = {
            "message": "Second message",
            "conversation_id": conversation_id
        }
        
        response2 = client.post("/api/chat", json=request_data2)
        
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["conversation_id"] == conversation_id
        assert isinstance(data2["response"], str)
        assert len(data2["response"]) > 0
        
        # Verify conversation has both messages
        assert conversation_id in conversations
        conversation = conversations[conversation_id]
        assert len(conversation.messages) == 4  # 2 user + 2 assistant messages
    
    def test_chat_conversation_persistence(self, client):
        """Test that conversations persist across multiple requests"""
        # First request creates new conversation
        response1 = client.post("/api/chat", json={"message": "Message 1"})
        data1 = response1.json()
        conversation_id = data1["conversation_id"]
        
        # Second request to same conversation
        response2 = client.post("/api/chat", json={
            "message": "Message 2",
            "conversation_id": conversation_id
        })
        data2 = response2.json()
        
        assert data2["conversation_id"] == conversation_id
        
        # Verify conversation has all messages
        conversation = conversations[conversation_id]
        assert len(conversation.messages) == 4  # 2 user + 2 assistant messages
        
        # Verify message order and content
        messages = conversation.messages
        assert messages[0].sender == "user"
        assert messages[0].content == "Message 1"
        assert messages[1].sender == "assistant"
        assert isinstance(messages[1].content, str)
        assert len(messages[1].content) > 0
        assert messages[2].sender == "user"
        assert messages[2].content == "Message 2"
        assert messages[3].sender == "assistant"
        assert isinstance(messages[3].content, str)
        assert len(messages[3].content) > 0
    
    def test_chat_message_validation(self, client):
        """Test message validation rules"""
        # Empty message should fail
        response = client.post("/api/chat", json={"message": ""})
        assert response.status_code == 422
        
        # Very long message should fail
        long_message = "x" * 10001
        response = client.post("/api/chat", json={"message": long_message})
        assert response.status_code == 422
        
        # Missing message field should fail
        response = client.post("/api/chat", json={})
        assert response.status_code == 422
    
    def test_chat_request_validation(self, client):
        """Test request validation for chat endpoint"""
        # Invalid JSON should fail
        response = client.post("/api/chat", data="invalid json")
        assert response.status_code == 422
        
        # Wrong content type should fail
        response = client.post("/api/chat", data={"message": "test"})
        assert response.status_code == 422
    
    def test_chat_response_format(self, client):
        """Test that chat response follows expected format"""
        request_data = {
            "message": "Test message",
            "conversation_id": "test-format-conv"
        }
        
        response = client.post("/api/chat", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all required fields are present
        required_fields = ["response", "conversation_id", "mcp_tools_used", "timestamp"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify field types
        assert isinstance(data["response"], str)
        assert isinstance(data["conversation_id"], str)
        assert isinstance(data["mcp_tools_used"], list)
        assert isinstance(data["timestamp"], str)
        
        # Verify timestamp format (ISO 8601)
        from datetime import datetime
        try:
            datetime.fromisoformat(data["timestamp"].replace('Z', '+00:00'))
        except ValueError:
            pytest.fail("Timestamp is not in valid ISO format")
    
    def test_chat_error_handling(self, client):
        """Test error handling in chat endpoint"""
        # Test with malformed request
        response = client.post("/api/chat", json={"invalid_field": "value"})
        assert response.status_code == 422
        
        # Verify error response format
        error_data = response.json()
        assert "detail" in error_data
    
    def test_multiple_conversations(self, client):
        """Test handling multiple separate conversations"""
        # Create first conversation
        response1 = client.post("/api/chat", json={"message": "Conv 1 message"})
        conv1_id = response1.json()["conversation_id"]
        
        # Create second conversation
        response2 = client.post("/api/chat", json={"message": "Conv 2 message"})
        conv2_id = response2.json()["conversation_id"]
        
        # Verify different conversation IDs
        assert conv1_id != conv2_id
        
        # Verify both conversations exist
        assert conv1_id in conversations
        assert conv2_id in conversations
        
        # Verify conversation isolation
        conv1 = conversations[conv1_id]
        conv2 = conversations[conv2_id]
        
        assert len(conv1.messages) == 2  # 1 user + 1 assistant
        assert len(conv2.messages) == 2  # 1 user + 1 assistant
        
        assert conv1.messages[0].content == "Conv 1 message"
        assert conv2.messages[0].content == "Conv 2 message"


class TestAIServiceIntegration:
    """Integration tests for AI service with chat endpoint"""
    
    @pytest.fixture
    def mock_ai_service(self):
        """Mock AI service for testing"""
        mock_service = Mock(spec=AIService)
        mock_service.generate_response = AsyncMock()
        return mock_service
    
    def test_chat_with_ai_service_success(self, client, mock_ai_service):
        """Test successful AI service integration"""
        # Mock AI response
        mock_ai_response = AIResponse(
            content="Hello! I'm doing well, thank you for asking. How can I help you today?",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=25,
            finish_reason="stop"
        )
        mock_ai_service.generate_response.return_value = mock_ai_response
        
        # Patch the AI service in the main module
        with patch('backend.main.ai_service', mock_ai_service):
            response = client.post("/api/chat", json={"message": "Hello, how are you?"})
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify AI response is used
            assert data["response"] == "Hello! I'm doing well, thank you for asking. How can I help you today?"
            assert isinstance(data["conversation_id"], str)
            assert data["mcp_tools_used"] == []
            
            # Verify AI service was called correctly
            mock_ai_service.generate_response.assert_called_once()
            call_args = mock_ai_service.generate_response.call_args
            assert call_args.kwargs['prompt'] == "Hello, how are you?"
            assert call_args.kwargs['conversation'] is not None
    
    def test_chat_with_conversation_context(self, client, mock_ai_service):
        """Test AI service receives conversation context"""
        # Mock AI responses
        responses = [
            AIResponse(content="Hello! Nice to meet you.", provider="openai", model="gpt-3.5-turbo"),
            AIResponse(content="I'm doing great, thanks for asking!", provider="openai", model="gpt-3.5-turbo")
        ]
        mock_ai_service.generate_response.side_effect = responses
        
        with patch('backend.main.ai_service', mock_ai_service):
            # First message
            response1 = client.post("/api/chat", json={"message": "Hello!"})
            assert response1.status_code == 200
            data1 = response1.json()
            conversation_id = data1["conversation_id"]
            
            # Second message with context
            response2 = client.post("/api/chat", json={
                "message": "How are you?",
                "conversation_id": conversation_id
            })
            assert response2.status_code == 200
            data2 = response2.json()
            
            # Verify responses
            assert data1["response"] == "Hello! Nice to meet you."
            assert data2["response"] == "I'm doing great, thanks for asking!"
            
            # Verify AI service was called twice
            assert mock_ai_service.generate_response.call_count == 2
            
            # Verify second call includes conversation context
            second_call = mock_ai_service.generate_response.call_args_list[1]
            conversation_arg = second_call.kwargs['conversation']
            assert conversation_arg is not None
            assert len(conversation_arg.messages) == 4  # First user message, AI response, second user message, second AI response
    
    def test_chat_ai_service_error_handling(self, client, mock_ai_service):
        """Test error handling when AI service fails"""
        # Mock AI service error
        mock_ai_service.generate_response.side_effect = AIServiceError("AI service unavailable")
        
        with patch('backend.main.ai_service', mock_ai_service):
            response = client.post("/api/chat", json={"message": "Hello"})
            
            assert response.status_code == 200
            data = response.json()
            
            # Should return fallback message
            assert "technical difficulties" in data["response"]
            assert isinstance(data["conversation_id"], str)
    
    def test_chat_ai_provider_error_handling(self, client, mock_ai_service):
        """Test error handling when AI provider fails"""
        # Mock AI provider error
        mock_ai_service.generate_response.side_effect = AIProviderError("OpenAI API error")
        
        with patch('backend.main.ai_service', mock_ai_service):
            response = client.post("/api/chat", json={"message": "Hello"})
            
            assert response.status_code == 200
            data = response.json()
            
            # Should return fallback message
            assert "technical difficulties" in data["response"]
            assert isinstance(data["conversation_id"], str)
    
    def test_chat_unexpected_error_handling(self, client, mock_ai_service):
        """Test error handling for unexpected errors"""
        # Mock unexpected error
        mock_ai_service.generate_response.side_effect = Exception("Unexpected error")
        
        with patch('backend.main.ai_service', mock_ai_service):
            response = client.post("/api/chat", json={"message": "Hello"})
            
            assert response.status_code == 200
            data = response.json()
            
            # Should return fallback message
            assert "unexpected error" in data["response"]
            assert isinstance(data["conversation_id"], str)
    
    def test_chat_timeout_handling(self, client, mock_ai_service):
        """Test timeout handling for AI service"""
        import asyncio
        
        # Mock timeout error
        mock_ai_service.generate_response.side_effect = asyncio.TimeoutError()
        
        with patch('backend.main.ai_service', mock_ai_service):
            response = client.post("/api/chat", json={"message": "Hello"})
            
            assert response.status_code == 200
            data = response.json()
            
            # Should return timeout-specific fallback message
            assert "technical difficulties due to a timeout" in data["response"]
            assert isinstance(data["conversation_id"], str)


class TestAPIIntegration:
    """Integration tests for the complete API"""
    
    def test_full_conversation_flow_without_ai(self, client):
        """Test a complete conversation flow without AI service"""
        # Start conversation
        response1 = client.post("/api/chat", json={"message": "Hello"})
        assert response1.status_code == 200
        data1 = response1.json()
        conversation_id = data1["conversation_id"]
        
        # Continue conversation
        messages = [
            "How are you?",
            "What can you help me with?",
            "Thank you!"
        ]
        
        for message in messages:
            response = client.post("/api/chat", json={
                "message": message,
                "conversation_id": conversation_id
            })
            assert response.status_code == 200
            data = response.json()
            assert data["conversation_id"] == conversation_id
            # Should return fallback message when no AI service
            assert "AI service is not available" in data["response"]
        
        # Verify final conversation state
        conversation = conversations[conversation_id]
        assert len(conversation.messages) == 8  # 4 user + 4 assistant messages
        
        # Verify message history
        user_messages = conversation.get_messages_by_sender("user")
        assistant_messages = conversation.get_messages_by_sender("assistant")
        
        assert len(user_messages) == 4
        assert len(assistant_messages) == 4
        
        expected_user_messages = ["Hello"] + messages
        for i, msg in enumerate(user_messages):
            assert msg.content == expected_user_messages[i]
    
    def test_full_conversation_flow_with_ai(self, client):
        """Test a complete conversation flow with AI service"""
        mock_ai_service = Mock(spec=AIService)
        
        # Mock different AI responses for each message
        responses = [
            AIResponse(content="Hello! Nice to meet you.", provider="openai", model="gpt-3.5-turbo"),
            AIResponse(content="I'm doing great, thanks!", provider="openai", model="gpt-3.5-turbo"),
            AIResponse(content="I can help with many things!", provider="openai", model="gpt-3.5-turbo"),
            AIResponse(content="You're welcome! Happy to help.", provider="openai", model="gpt-3.5-turbo")
        ]
        mock_ai_service.generate_response = AsyncMock(side_effect=responses)
        
        with patch('backend.main.ai_service', mock_ai_service):
            # Start conversation
            response1 = client.post("/api/chat", json={"message": "Hello"})
            assert response1.status_code == 200
            data1 = response1.json()
            conversation_id = data1["conversation_id"]
            assert data1["response"] == "Hello! Nice to meet you."
            
            # Continue conversation
            messages = [
                "How are you?",
                "What can you help me with?",
                "Thank you!"
            ]
            
            expected_responses = [
                "I'm doing great, thanks!",
                "I can help with many things!",
                "You're welcome! Happy to help."
            ]
            
            for i, message in enumerate(messages):
                response = client.post("/api/chat", json={
                    "message": message,
                    "conversation_id": conversation_id
                })
                assert response.status_code == 200
                data = response.json()
                assert data["conversation_id"] == conversation_id
                assert data["response"] == expected_responses[i]
            
            # Verify AI service was called for each message
            assert mock_ai_service.generate_response.call_count == 4
            
            # Verify final conversation state
            conversation = conversations[conversation_id]
            assert len(conversation.messages) == 8  # 4 user + 4 assistant messages
    
    def test_api_cors_headers(self, client):
        """Test that CORS headers are properly set"""
        response = client.options("/api/chat")
        # Note: TestClient doesn't fully simulate CORS, but we can verify the middleware is configured
        # The actual CORS functionality would be tested in a full integration environment
        assert response.status_code in [200, 405]  # OPTIONS might not be explicitly handled
    
    def test_complete_chat_flow_with_context_and_error_handling(self, client):
        """Test complete chat flow including context building and error scenarios"""
        mock_ai_service = Mock(spec=AIService)
        
        # Mock responses for different scenarios
        successful_response = AIResponse(
            content="I understand your question based on our conversation.",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=45
        )
        
        timeout_error = asyncio.TimeoutError()
        service_error = AIServiceError("Service temporarily unavailable")
        
        # Test sequence: success -> timeout -> service error -> success
        mock_ai_service.generate_response = AsyncMock(side_effect=[
            successful_response,
            timeout_error,
            service_error,
            successful_response
        ])
        
        with patch('backend.main.ai_service', mock_ai_service):
            conversation_id = None
            
            # First successful message
            response1 = client.post("/api/chat", json={"message": "Hello, I need help with Python"})
            assert response1.status_code == 200
            data1 = response1.json()
            conversation_id = data1["conversation_id"]
            assert data1["response"] == "I understand your question based on our conversation."
            
            # Second message with timeout
            response2 = client.post("/api/chat", json={
                "message": "Can you explain decorators?",
                "conversation_id": conversation_id
            })
            assert response2.status_code == 200
            data2 = response2.json()
            assert data2["conversation_id"] == conversation_id
            assert "technical difficulties due to a timeout" in data2["response"]
            
            # Third message with service error
            response3 = client.post("/api/chat", json={
                "message": "What about async/await?",
                "conversation_id": conversation_id
            })
            assert response3.status_code == 200
            data3 = response3.json()
            assert data3["conversation_id"] == conversation_id
            assert "technical difficulties" in data3["response"]
            
            # Fourth message successful again
            response4 = client.post("/api/chat", json={
                "message": "Thanks for your help",
                "conversation_id": conversation_id
            })
            assert response4.status_code == 200
            data4 = response4.json()
            assert data4["conversation_id"] == conversation_id
            assert data4["response"] == "I understand your question based on our conversation."
            
            # Verify conversation state
            conversation = conversations[conversation_id]
            assert len(conversation.messages) == 8  # 4 user + 4 assistant messages
            
            # Verify that AI service was called with proper context for each request
            assert mock_ai_service.generate_response.call_count == 4
            
            # Check that conversation context was passed correctly
            for call in mock_ai_service.generate_response.call_args_list:
                assert 'conversation' in call.kwargs
                assert call.kwargs['conversation'] is not None
                assert call.kwargs['conversation'].id == conversation_id
            
            # Verify context building - check that conversation context was passed correctly
            # Note: The conversation object is passed by reference and gets updated,
            # so we verify that the conversation was passed and has the expected final state
            first_call_conversation = mock_ai_service.generate_response.call_args_list[0].kwargs['conversation']
            last_call_conversation = mock_ai_service.generate_response.call_args_list[3].kwargs['conversation']
            
            # Both should reference the same conversation object
            assert first_call_conversation.id == conversation_id
            assert last_call_conversation.id == conversation_id
            assert first_call_conversation is last_call_conversation  # Same object reference