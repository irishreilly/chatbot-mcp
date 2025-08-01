"""
AI Service for handling language model interactions.
Supports OpenAI and Anthropic providers with configurable settings and MCP tool integration.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Union
from enum import Enum
from dataclasses import dataclass
import openai
import anthropic
from config import settings
from models.conversation import Conversation
from models.message import Message
from services.simple_mcp_client import simple_mcp_client

logger = logging.getLogger(__name__)

class AIProvider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"

@dataclass
class AIResponse:
    content: str
    provider: str
    model: str
    tokens_used: Optional[int] = None
    finish_reason: Optional[str] = None
    mcp_tools_used: List[str] = None
    
    def __post_init__(self):
        if self.mcp_tools_used is None:
            self.mcp_tools_used = []

class AIServiceError(Exception):
    """Base exception for AI service errors"""
    pass

class AIProviderError(AIServiceError):
    """Exception for AI provider-specific errors"""
    pass

class AIService:
    """
    AI Service for generating chat responses using configurable LLM providers.
    Handles conversation context management and error handling.
    """
    
    def __init__(self, 
                 provider: AIProvider = AIProvider.OPENAI,
                 model: Optional[str] = None,
                 timeout: int = 45):
        self.provider = provider
        self.timeout = timeout
        
        # Set default models
        if model is None:
            self.model = "gpt-4o-mini" if provider == AIProvider.OPENAI else "claude-3-5-sonnet-20241022"
        else:
            self.model = model
            
        # Initialize clients
        self._openai_client = None
        self._anthropic_client = None
        
        # Initialize MCP client manager
        self.mcp_manager = None
        
        self._initialize_clients()
        self._initialize_mcp()
    
    def _initialize_clients(self):
        """Initialize AI provider clients based on available API keys"""
        if settings.openai_api_key:
            try:
                # Initialize OpenAI client with the latest version
                self._openai_client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
                logger.info("OpenAI client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI client: {e}")
                self._openai_client = None
        
        if settings.anthropic_api_key:
            try:
                self._anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
                logger.info("Anthropic client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Anthropic client: {e}")
                self._anthropic_client = None
        
        # Validate that the selected provider has a valid client
        if self.provider == AIProvider.OPENAI and not self._openai_client:
            raise AIServiceError("OpenAI API key not configured")
        elif self.provider == AIProvider.ANTHROPIC and not self._anthropic_client:
            raise AIServiceError("Anthropic API key not configured")
    
    def _initialize_mcp(self):
        """Initialize MCP client manager"""
        logger.info("MCP integration enabled with simple client")
        self.mcp_manager = simple_mcp_client
    
    def build_context(self, conversation: Optional[Conversation] = None, 
                     additional_context: Optional[str] = None) -> List[Dict[str, str]]:
        """
        Build conversation context for AI model.
        
        Args:
            conversation: Conversation object with message history
            additional_context: Additional context to include in the prompt
            
        Returns:
            List of message dictionaries formatted for the AI provider
        """
        messages = []
        
        # Add system message with context
        system_content = "You are a helpful AI assistant."
        if additional_context:
            system_content += f"\n\nAdditional context: {additional_context}"
        
        messages.append({"role": "system", "content": system_content})
        
        # Add conversation history
        if conversation and conversation.messages:
            for message in conversation.messages[-10:]:  # Limit to last 10 messages
                role = "user" if message.sender == "user" else "assistant"
                messages.append({"role": role, "content": message.content})
        
        return messages
    
    async def initialize_mcp_connections(self):
        """Initialize MCP server connections"""
        logger.info("MCP connections ready with simple client")
        # Simple client doesn't need explicit connection initialization
    
    async def get_relevant_tools(self, query: str) -> List[str]:
        """Get MCP tools relevant to the query"""
        if not self.mcp_manager:
            return []
        
        try:
            return await self.mcp_manager.get_relevant_tools(query)
        except Exception as e:
            logger.error(f"Error getting relevant tools: {e}")
            return []
    
    async def call_mcp_tools(self, tools_to_call: List[str]) -> List[Any]:
        """Call MCP tools and return results"""
        if not self.mcp_manager:
            return []
        
        try:
            return await self.mcp_manager.call_multiple_tools(tools_to_call)
        except Exception as e:
            logger.error(f"Error calling MCP tools: {e}")
            return []
    
    async def generate_response(self, 
                              prompt: str,
                              conversation: Optional[Conversation] = None,
                              additional_context: Optional[str] = None) -> AIResponse:
        """
        Generate AI response for the given prompt and context, with MCP tool integration.
        
        Args:
            prompt: User's message/prompt
            conversation: Conversation history for context
            additional_context: Additional context to include
            
        Returns:
            AIResponse object with generated content and metadata
            
        Raises:
            AIServiceError: For general AI service errors
            AIProviderError: For provider-specific errors
        """
        try:
            mcp_tools_used = []
            
            # Check for relevant MCP tools
            relevant_tools = await self.get_relevant_tools(prompt)
            
            # If we have relevant tools, call them and add results to context
            if relevant_tools:
                logger.info(f"Found {len(relevant_tools)} relevant MCP tools for query: {relevant_tools}")
                
                try:
                    tool_results = await self.call_mcp_tools(relevant_tools)
                    mcp_tools_used = [tool.tool_name for tool in tool_results if hasattr(tool, 'tool_name')]
                    
                    # Format tool results for context
                    if tool_results and self.mcp_manager:
                        tool_context = self.mcp_manager.format_tool_results(tool_results)
                        if tool_context:
                            if additional_context:
                                additional_context += f"\n\n{tool_context}"
                            else:
                                additional_context = tool_context
                            logger.info(f"Added MCP tool results to context")
                    
                except Exception as e:
                    logger.error(f"Error executing MCP tools: {e}")
                    mcp_tools_used = []
            
            # Build conversation context
            messages = self.build_context(conversation, additional_context)
            
            # Add the current prompt
            messages.append({"role": "user", "content": prompt})
            
            # Generate response based on provider
            if self.provider == AIProvider.OPENAI:
                response = await self._generate_openai_response(messages)
            elif self.provider == AIProvider.ANTHROPIC:
                response = await self._generate_anthropic_response(messages)
            else:
                raise AIServiceError(f"Unsupported provider: {self.provider}")
            
            # Add MCP tools used to the response
            response.mcp_tools_used = mcp_tools_used
            return response
                
        except asyncio.TimeoutError:
            logger.error(f"AI request timed out after {self.timeout} seconds")
            raise AIServiceError(f"Request timed out after {self.timeout} seconds. This may be due to complex MCP operations or slow external services.")
        except Exception as e:
            logger.error(f"Error generating AI response: {str(e)}")
            raise AIProviderError(f"Provider error: {str(e)}")
    
    async def _generate_openai_response(self, messages: List[Dict[str, str]]) -> AIResponse:
        """Generate response using OpenAI API"""
        try:
            response = await asyncio.wait_for(
                self._openai_client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    max_tokens=1000,
                    temperature=0.7
                ),
                timeout=self.timeout
            )
            
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            finish_reason = response.choices[0].finish_reason
            
            return AIResponse(
                content=content,
                provider="openai",
                model=self.model,
                tokens_used=tokens_used,
                finish_reason=finish_reason
            )
            
        except openai.APIError as e:
            logger.error(f"OpenAI API error: {str(e)}")
            raise AIProviderError(f"OpenAI API error: {str(e)}")
    
    async def _generate_anthropic_response(self, messages: List[Dict[str, str]]) -> AIResponse:
        """Generate response using Anthropic API"""
        try:
            # Anthropic expects system message separately
            system_message = ""
            formatted_messages = []
            
            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    formatted_messages.append(msg)
            
            response = await asyncio.wait_for(
                self._anthropic_client.messages.create(
                    model=self.model,
                    max_tokens=1000,
                    system=system_message,
                    messages=formatted_messages
                ),
                timeout=self.timeout
            )
            
            content = response.content[0].text
            tokens_used = response.usage.input_tokens + response.usage.output_tokens
            
            return AIResponse(
                content=content,
                provider="anthropic",
                model=self.model,
                tokens_used=tokens_used,
                finish_reason=response.stop_reason
            )
            
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {str(e)}")
            raise AIProviderError(f"Anthropic API error: {str(e)}")
    
    def get_available_providers(self) -> List[str]:
        """Get list of available AI providers based on configured API keys"""
        providers = []
        if self._openai_client:
            providers.append("openai")
        if self._anthropic_client:
            providers.append("anthropic")
        return providers
    
    def switch_provider(self, provider: AIProvider, model: Optional[str] = None):
        """Switch to a different AI provider"""
        if provider == AIProvider.OPENAI and not self._openai_client:
            raise AIServiceError("OpenAI not available - API key not configured")
        elif provider == AIProvider.ANTHROPIC and not self._anthropic_client:
            raise AIServiceError("Anthropic not available - API key not configured")
        
        self.provider = provider
        if model:
            self.model = model
        else:
            # Set default model for provider
            self.model = "gpt-3.5-turbo" if provider == AIProvider.OPENAI else "claude-3-sonnet-20240229"
        
        logger.info(f"Switched to provider: {provider.value}, model: {self.model}")