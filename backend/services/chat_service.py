"""
Chat Service - Main orchestration service for AI and MCP interactions
Coordinates between AI service and MCP client manager to provide enhanced responses
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone

from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.mcp import MCPToolCall
from backend.services.ai_service import AIService, AIResponse, AIServiceError
from backend.services.mcp_client_manager import MCPClientManager, MCPClientManagerError

logger = logging.getLogger(__name__)


class ChatServiceError(Exception):
    """Base exception for chat service errors"""
    pass


class ChatService:
    """
    Main chat service that orchestrates AI and MCP interactions.
    Determines when to use MCP tools and integrates results into responses.
    """
    
    def __init__(self, 
                 ai_service: AIService,
                 mcp_client_manager: Optional[MCPClientManager] = None):
        self.ai_service = ai_service
        self.mcp_client_manager = mcp_client_manager
        self.tool_keywords = [
            'search', 'find', 'lookup', 'get', 'fetch', 'retrieve',
            'weather', 'temperature', 'forecast',
            'file', 'read', 'write', 'save', 'open',
            'database', 'query', 'data', 'information',
            'api', 'call', 'request', 'http',
            'calculate', 'compute', 'math',
            'translate', 'language',
            'time', 'date', 'schedule', 'calendar'
        ]
    
    async def process_message(self, 
                            message: str, 
                            conversation_id: str,
                            conversation: Optional[Conversation] = None) -> Dict[str, Any]:
        """
        Process a user message and generate a response using AI and MCP tools as needed.
        
        Args:
            message: User's message
            conversation_id: ID of the conversation
            conversation: Optional conversation object for context
            
        Returns:
            Dictionary containing response, tools used, and metadata
        """
        try:
            logger.info(f"Processing message for conversation {conversation_id}")
            
            # Determine if MCP tools are needed
            should_use_mcp, relevant_tools = await self._should_use_mcp_tools(message)
            
            mcp_results = []
            mcp_tools_used = []
            
            # Execute MCP tools if needed and available
            if should_use_mcp and self.mcp_client_manager and relevant_tools:
                logger.info(f"Using MCP tools: {[tool['name'] for tool in relevant_tools]}")
                mcp_results = await self._execute_mcp_tools(message, relevant_tools, conversation)
                mcp_tools_used = [result.tool_name for result in mcp_results if result.status == "success"]
            
            # Generate AI response with MCP context
            ai_response = await self._generate_ai_response(
                message=message,
                conversation=conversation,
                mcp_results=mcp_results
            )
            
            # Integrate MCP results into the final response
            final_response = self._integrate_mcp_results(ai_response.content, mcp_results)
            
            return {
                'response': final_response,
                'conversation_id': conversation_id,
                'mcp_tools_used': mcp_tools_used,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'ai_provider': ai_response.provider,
                'ai_model': ai_response.model,
                'tokens_used': ai_response.tokens_used
            }
            
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
            raise ChatServiceError(f"Failed to process message: {str(e)}")
    
    async def _should_use_mcp_tools(self, message: str) -> Tuple[bool, List[Dict[str, Any]]]:
        """
        Determine if MCP tools should be used for the given message.
        
        Args:
            message: User's message
            
        Returns:
            Tuple of (should_use_mcp, relevant_tools)
        """
        if not self.mcp_client_manager:
            return False, []
        
        # Check if any tool keywords are present in the message
        message_lower = message.lower()
        has_tool_keywords = any(keyword in message_lower for keyword in self.tool_keywords)
        
        if not has_tool_keywords:
            return False, []
        
        # Find relevant tools based on the message content
        relevant_tools = self.mcp_client_manager.select_tools_for_query(message, max_tools=3)
        
        if not relevant_tools:
            logger.info("No relevant MCP tools found for the query")
            return False, []
        
        logger.info(f"Found {len(relevant_tools)} relevant MCP tools")
        return True, relevant_tools
    
    async def _execute_mcp_tools(self, 
                                message: str, 
                                tools: List[Dict[str, Any]],
                                conversation: Optional[Conversation] = None) -> List[MCPToolCall]:
        """
        Execute relevant MCP tools based on the user message.
        
        Args:
            message: User's message
            tools: List of relevant tools to execute
            conversation: Optional conversation context for parameter extraction
            
        Returns:
            List of MCPToolCall results
        """
        tool_calls = []
        
        for tool in tools:
            server_name = tool.get('server_name')
            tool_name = tool.get('name')
            
            if not server_name or not tool_name:
                logger.warning(f"Invalid tool configuration: {tool}")
                continue
            
            # Generate parameters for the tool based on the message
            parameters = self._generate_tool_parameters(message, tool, conversation)
            
            tool_calls.append({
                'server_name': server_name,
                'tool_name': tool_name,
                'parameters': parameters
            })
        
        if not tool_calls:
            return []
        
        # Execute tools in parallel
        try:
            results = await self.mcp_client_manager.call_tools_parallel(tool_calls)
            
            # Log results
            for result in results:
                if result.status == "success":
                    logger.info(f"Tool {result.tool_name} executed successfully")
                else:
                    logger.warning(f"Tool {result.tool_name} failed: {result.error}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error executing MCP tools: {str(e)}")
            return []
    
    def _generate_tool_parameters(self, message: str, tool: Dict[str, Any], conversation: Optional[Conversation] = None) -> Dict[str, Any]:
        """
        Generate parameters for a tool based on the user message and tool schema.
        
        Args:
            message: User's message
            tool: Tool definition with schema
            conversation: Optional conversation context for parameter extraction
            
        Returns:
            Dictionary of parameters for the tool
        """
        parameters = {}
        
        # Get tool input schema
        input_schema = tool.get('inputSchema', {})
        properties = input_schema.get('properties', {})
        
        # Simple parameter extraction based on common patterns
        for prop_name, prop_def in properties.items():
            prop_type = prop_def.get('type', 'string')
            
            # Common parameter mappings
            if prop_name.lower() in ['query', 'q', 'search', 'term']:
                parameters[prop_name] = message
            elif prop_name.lower() in ['text', 'content', 'input']:
                parameters[prop_name] = message
            elif prop_name.lower() in ['location', 'city']:
                # Try to extract location from current message first
                location = self._extract_location(message)
                # If not found and we have conversation context, look in recent messages
                if not location and conversation:
                    location = self._extract_location_from_conversation(conversation)
                if location:
                    parameters[prop_name] = location
            elif prop_name.lower() in ['limit', 'count', 'max'] and prop_type in ['integer', 'number']:
                parameters[prop_name] = 5  # Default limit
            elif prop_name.lower() in ['format', 'type'] and 'enum' in prop_def:
                # Use first enum value as default
                enum_values = prop_def.get('enum', [])
                if enum_values:
                    parameters[prop_name] = enum_values[0]
            elif prop_name.lower() == 'days' and prop_type in ['integer', 'number']:
                # Extract number of days from message
                days = self._extract_days_from_message(message)
                if days:
                    parameters[prop_name] = days
        
        # If no parameters were generated, use the message as a generic query
        if not parameters and 'query' in properties:
            parameters['query'] = message
        elif not parameters and len(properties) == 1:
            # If there's only one parameter, use the message
            param_name = list(properties.keys())[0]
            parameters[param_name] = message
        
        logger.debug(f"Generated parameters for {tool.get('name')}: {parameters}")
        return parameters
    
    def _extract_location(self, message: str) -> Optional[str]:
        """Extract location from message using simple patterns"""
        # Simple location extraction patterns
        location_patterns = [
            r'in ([A-Z][a-z]+(?: [A-Z][a-z]+)*)',  # "in New York"
            r'at ([A-Z][a-z]+(?: [A-Z][a-z]+)*)',  # "at San Francisco"
            r'for ([A-Z][a-z]+(?: [A-Z][a-z]+)*)', # "for London"
        ]
        
        for pattern in location_patterns:
            match = re.search(pattern, message)
            if match:
                return match.group(1)
        
        return None
    
    def _extract_location_from_conversation(self, conversation: Conversation) -> Optional[str]:
        """Extract location from recent conversation messages"""
        if not conversation or not conversation.messages:
            return None
        
        # Look through recent messages (last 5) for location mentions
        recent_messages = conversation.messages[-5:]
        
        for message in reversed(recent_messages):  # Start with most recent
            location = self._extract_location(message.content)
            if location:
                return location
        
        return None
    
    def _extract_days_from_message(self, message: str) -> Optional[int]:
        """Extract number of days from message"""
        # Look for patterns like "5 days", "3-day", "tomorrow" (1 day), etc.
        day_patterns = [
            r'(\d+)\s*days?',  # "5 days", "3 day"
            r'(\d+)-day',      # "3-day"
            r'(\d+)\s*d\b',    # "5d"
        ]
        
        for pattern in day_patterns:
            match = re.search(pattern, message.lower())
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
        
        # Handle special cases
        if 'tomorrow' in message.lower():
            return 1
        elif 'week' in message.lower():
            return 7
        
        return None
    
    async def _generate_ai_response(self, 
                                  message: str,
                                  conversation: Optional[Conversation] = None,
                                  mcp_results: List[MCPToolCall] = None) -> AIResponse:
        """
        Generate AI response with optional MCP context.
        
        Args:
            message: User's message
            conversation: Conversation context
            mcp_results: Results from MCP tool calls
            
        Returns:
            AIResponse object
        """
        # Build additional context from MCP results
        additional_context = None
        if mcp_results:
            context_parts = []
            for result in mcp_results:
                if result.status == "success" and result.result:
                    context_parts.append(
                        f"Tool '{result.tool_name}' returned: {str(result.result)[:500]}"
                    )
            
            if context_parts:
                additional_context = "Available information from tools:\n" + "\n".join(context_parts)
        
        try:
            return await self.ai_service.generate_response(
                prompt=message,
                conversation=conversation,
                additional_context=additional_context
            )
        except AIServiceError as e:
            logger.error(f"AI service error: {str(e)}")
            # Return a fallback response
            return AIResponse(
                content="I'm experiencing some technical difficulties. Please try again later.",
                provider="fallback",
                model="none"
            )
    
    def _integrate_mcp_results(self, ai_response: str, mcp_results: List[MCPToolCall]) -> str:
        """
        Integrate MCP tool results into the AI response.
        
        Args:
            ai_response: Generated AI response
            mcp_results: Results from MCP tool calls
            
        Returns:
            Integrated response string
        """
        if not mcp_results:
            return ai_response
        
        # Check if AI response already incorporates the tool results
        # If the AI response is very short or generic, append tool results
        if len(ai_response.strip()) < 50 or any(phrase in ai_response.lower() for phrase in [
            "i don't have", "i cannot", "i'm not able", "i don't know"
        ]):
            # Append successful tool results
            successful_results = [r for r in mcp_results if r.status == "success" and r.result]
            if successful_results:
                result_text = "\n\nHere's what I found using available tools:\n"
                for result in successful_results:
                    result_text += f"\n• {result.tool_name}: {str(result.result)[:200]}"
                    if len(str(result.result)) > 200:
                        result_text += "..."
                
                return ai_response + result_text
        
        return ai_response
    
    def get_mcp_status(self) -> Dict[str, Any]:
        """
        Get status of MCP integration.
        
        Returns:
            Dictionary with MCP status information
        """
        if not self.mcp_client_manager:
            return {
                'available': False,
                'servers': {},
                'total_tools': 0
            }
        
        server_status = self.mcp_client_manager.get_server_status()
        total_tools = sum(status.get('tool_count', 0) for status in server_status.values())
        
        return {
            'available': True,
            'servers': server_status,
            'total_tools': total_tools,
            'connected_servers': len([s for s in server_status.values() if s.get('connected', False)])
        }
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of all available MCP tools.
        
        Returns:
            List of tool definitions with server information
        """
        if not self.mcp_client_manager:
            return []
        
        return self.mcp_client_manager.get_all_tools_flat()
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on chat service components.
        
        Returns:
            Dictionary with health status
        """
        health_status = {
            'chat_service': True,
            'ai_service': False,
            'mcp_service': False,
            'details': {}
        }
        
        # Check AI service
        try:
            available_providers = self.ai_service.get_available_providers()
            health_status['ai_service'] = len(available_providers) > 0
            health_status['details']['ai_providers'] = available_providers
        except Exception as e:
            health_status['details']['ai_error'] = str(e)
        
        # Check MCP service
        if self.mcp_client_manager:
            try:
                server_health = await self.mcp_client_manager.health_check_servers()
                healthy_servers = sum(1 for status in server_health.values() if status)
                health_status['mcp_service'] = healthy_servers > 0
                health_status['details']['mcp_servers'] = server_health
            except Exception as e:
                health_status['details']['mcp_error'] = str(e)
        
        return health_status