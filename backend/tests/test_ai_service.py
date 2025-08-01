"""
Unit tests for AI Service with mocked AI responses.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch
import asyncio
from backend.services.ai_service import (
    AIService, 
    AIProvider, 
    AIResponse, 
    AIServiceError, 
    AIProviderError
)
from backend.models.conversation import Conversation
from backend.models.message import Message
from datetime import datetime

class TestAIService:
    """Test cases for AIService class"""
    
    @pytest.fixture
    def mock_settings(self):
        """Mock settings with API keys"""
        with patch('backend.services.ai_service.settings') as mock_settings:
            mock_settings.openai_api_key = "test-openai-key"
            mock_settings.anthropic_api_key = "test-anthropic-key"
            yield mock_settings
    
    @pytest.fixture
    def ai_service_openai(self, mock_settings):
        """Create AI service instance with OpenAI provider"""
        with patch('backend.services.ai_service.openai.AsyncOpenAI') as mock_openai:
            with patch('backend.services.ai_service.anthropic.AsyncAnthropic') as mock_anthropic:
                service = AIService(provider=AIProvider.OPENAI)
                service._openai_client = mock_openai.return_value
                service._anthropic_client = mock_anthropic.return_value
                yield service
    
    @pytest.fixture
    def ai_service_anthropic(self, mock_settings):
        """Create AI service instance with Anthropic provider"""
        with patch('backend.services.ai_service.openai.AsyncOpenAI') as mock_openai:
            with patch('backend.services.ai_service.anthropic.AsyncAnthropic') as mock_anthropic:
                service = AIService(provider=AIProvider.ANTHROPIC)
                service._openai_client = mock_openai.return_value
                service._anthropic_client = mock_anthropic.return_value
                yield service
    
    @pytest.fixture
    def sample_conversation(self):
        """Create sample conversation for testing"""
        conversation = Conversation(
            id="test-conv-1",
            messages=[
                Message(
                    id="msg-1",
                    conversation_id="test-conv-1",
                    content="Hello, how are you?",
                    sender="user",
                    timestamp=datetime.now()
                ),
                Message(
                    id="msg-2",
                    conversation_id="test-conv-1",
                    content="I'm doing well, thank you! How can I help you today?",
                    sender="assistant",
                    timestamp=datetime.now()
                )
            ],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        return conversation
    
    def test_ai_service_initialization_openai(self, mock_settings):
        """Test AI service initialization with OpenAI"""
        with patch('backend.services.ai_service.openai.AsyncOpenAI') as mock_openai:
            with patch('backend.services.ai_service.anthropic.AsyncAnthropic') as mock_anthropic:
                service = AIService(provider=AIProvider.OPENAI)
                
                assert service.provider == AIProvider.OPENAI
                assert service.model == "gpt-3.5-turbo"
                assert service.timeout == 30
                mock_openai.assert_called_once()
                mock_anthropic.assert_called_once()
    
    def test_ai_service_initialization_anthropic(self, mock_settings):
        """Test AI service initialization with Anthropic"""
        with patch('backend.services.ai_service.openai.AsyncOpenAI') as mock_openai:
            with patch('backend.services.ai_service.anthropic.AsyncAnthropic') as mock_anthropic:
                service = AIService(provider=AIProvider.ANTHROPIC, model="claude-3-opus-20240229")
                
                assert service.provider == AIProvider.ANTHROPIC
                assert service.model == "claude-3-opus-20240229"
                mock_openai.assert_called_once()
                mock_anthropic.assert_called_once()
    
    def test_ai_service_initialization_missing_key(self):
        """Test AI service initialization with missing API key"""
        with patch('backend.services.ai_service.settings') as mock_settings:
            mock_settings.openai_api_key = None
            mock_settings.anthropic_api_key = "test-key"
            
            with pytest.raises(AIServiceError, match="OpenAI API key not configured"):
                AIService(provider=AIProvider.OPENAI)
    
    def test_build_context_empty(self, ai_service_openai):
        """Test building context with no conversation history"""
        messages = ai_service_openai.build_context()
        
        assert len(messages) == 1
        assert messages[0]["role"] == "system"
        assert "helpful AI assistant" in messages[0]["content"]
    
    def test_build_context_with_conversation(self, ai_service_openai, sample_conversation):
        """Test building context with conversation history"""
        messages = ai_service_openai.build_context(conversation=sample_conversation)
        
        assert len(messages) == 3  # system + 2 conversation messages
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello, how are you?"
        assert messages[2]["role"] == "assistant"
        assert messages[2]["content"] == "I'm doing well, thank you! How can I help you today?"
    
    def test_build_context_with_additional_context(self, ai_service_openai):
        """Test building context with additional context"""
        additional_context = "The user is asking about Python programming."
        messages = ai_service_openai.build_context(additional_context=additional_context)
        
        assert len(messages) == 1
        assert messages[0]["role"] == "system"
        assert additional_context in messages[0]["content"]
    
    def test_build_context_limits_messages(self, ai_service_openai):
        """Test that context building limits message history"""
        # Create conversation with many messages
        conversation = Conversation(
            id="test-conv",
            messages=[
                Message(
                    id=f"msg-{i}",
                    conversation_id="test-conv",
                    content=f"Message {i}",
                    sender="user" if i % 2 == 0 else "assistant",
                    timestamp=datetime.now()
                ) for i in range(15)
            ],
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        messages = ai_service_openai.build_context(conversation=conversation)
        
        # Should be system message + last 10 conversation messages
        assert len(messages) == 11
        assert messages[0]["role"] == "system"
        # Check that it includes the last messages
        assert "Message 14" in messages[-1]["content"]
    
    @pytest.mark.asyncio
    async def test_generate_response_openai_success(self, ai_service_openai):
        """Test successful OpenAI response generation"""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "This is a test response"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage.total_tokens = 50
        
        ai_service_openai._openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        response = await ai_service_openai.generate_response("Hello, world!")
        
        assert isinstance(response, AIResponse)
        assert response.content == "This is a test response"
        assert response.provider == "openai"
        assert response.model == "gpt-3.5-turbo"
        assert response.tokens_used == 50
        assert response.finish_reason == "stop"
    
    @pytest.mark.asyncio
    async def test_generate_response_anthropic_success(self, ai_service_anthropic):
        """Test successful Anthropic response generation"""
        # Mock Anthropic response
        mock_response = Mock()
        mock_response.content = [Mock()]
        mock_response.content[0].text = "This is an Anthropic response"
        mock_response.stop_reason = "end_turn"
        mock_response.usage.input_tokens = 20
        mock_response.usage.output_tokens = 30
        
        ai_service_anthropic._anthropic_client.messages.create = AsyncMock(return_value=mock_response)
        
        response = await ai_service_anthropic.generate_response("Hello, world!")
        
        assert isinstance(response, AIResponse)
        assert response.content == "This is an Anthropic response"
        assert response.provider == "anthropic"
        assert response.tokens_used == 50  # 20 + 30
        assert response.finish_reason == "end_turn"
    
    @pytest.mark.asyncio
    async def test_generate_response_openai_api_error(self, ai_service_openai):
        """Test OpenAI API error handling"""
        # Use a generic exception that will be caught as an API error
        ai_service_openai._openai_client.chat.completions.create = AsyncMock(
            side_effect=Exception("OpenAI API Error")
        )
        
        with pytest.raises(AIProviderError, match="Provider error"):
            await ai_service_openai.generate_response("Hello, world!")
    
    @pytest.mark.asyncio
    async def test_generate_response_anthropic_api_error(self, ai_service_anthropic):
        """Test Anthropic API error handling"""
        # Use a generic exception that will be caught as an API error
        ai_service_anthropic._anthropic_client.messages.create = AsyncMock(
            side_effect=Exception("Anthropic API Error")
        )
        
        with pytest.raises(AIProviderError, match="Provider error"):
            await ai_service_anthropic.generate_response("Hello, world!")
    
    @pytest.mark.asyncio
    async def test_generate_response_timeout(self, ai_service_openai):
        """Test timeout handling"""
        ai_service_openai._openai_client.chat.completions.create = AsyncMock(
            side_effect=asyncio.TimeoutError()
        )
        
        with pytest.raises(AIServiceError, match="Request timed out"):
            await ai_service_openai.generate_response("Hello, world!")
    
    @pytest.mark.asyncio
    async def test_generate_response_with_conversation_context(self, ai_service_openai, sample_conversation):
        """Test response generation with conversation context"""
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "Response with context"
        mock_response.choices[0].finish_reason = "stop"
        mock_response.usage.total_tokens = 75
        
        ai_service_openai._openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        response = await ai_service_openai.generate_response(
            "What did I just ask?", 
            conversation=sample_conversation
        )
        
        assert response.content == "Response with context"
        
        # Verify that the conversation context was included in the API call
        call_args = ai_service_openai._openai_client.chat.completions.create.call_args
        messages = call_args.kwargs['messages']
        
        # Should include system message, conversation history, and new prompt
        assert len(messages) == 4
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello, how are you?"
        assert messages[3]["role"] == "user"
        assert messages[3]["content"] == "What did I just ask?"
    
    def test_get_available_providers(self, ai_service_openai):
        """Test getting available providers"""
        providers = ai_service_openai.get_available_providers()
        
        assert "openai" in providers
        assert "anthropic" in providers
    
    def test_switch_provider_success(self, ai_service_openai):
        """Test successful provider switching"""
        ai_service_openai.switch_provider(AIProvider.ANTHROPIC, "claude-3-opus-20240229")
        
        assert ai_service_openai.provider == AIProvider.ANTHROPIC
        assert ai_service_openai.model == "claude-3-opus-20240229"
    
    def test_switch_provider_unavailable(self, mock_settings):
        """Test switching to unavailable provider"""
        mock_settings.openai_api_key = "test-key"
        mock_settings.anthropic_api_key = None
        
        with patch('backend.services.ai_service.openai.AsyncOpenAI'):
            service = AIService(provider=AIProvider.OPENAI)
            service._anthropic_client = None
            
            with pytest.raises(AIServiceError, match="Anthropic not available"):
                service.switch_provider(AIProvider.ANTHROPIC)
    
    def test_ai_response_dataclass(self):
        """Test AIResponse dataclass"""
        response = AIResponse(
            content="Test content",
            provider="openai",
            model="gpt-3.5-turbo",
            tokens_used=100,
            finish_reason="stop"
        )
        
        assert response.content == "Test content"
        assert response.provider == "openai"
        assert response.model == "gpt-3.5-turbo"
        assert response.tokens_used == 100
        assert response.finish_reason == "stop"
    
    def test_ai_service_error_inheritance(self):
        """Test AI service error classes"""
        assert issubclass(AIProviderError, AIServiceError)
        assert issubclass(AIServiceError, Exception)
        
        error = AIProviderError("Test error")
        assert str(error) == "Test error"