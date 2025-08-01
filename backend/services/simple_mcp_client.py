"""
Simplified MCP Client for Grafana integration
Uses Docker-based MCP server with stdio transport
"""

import asyncio
import json
import logging
import subprocess
import os
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from config import settings

logger = logging.getLogger(__name__)

@dataclass
class MCPToolResult:
    """Result from MCP tool execution"""
    tool_name: str
    success: bool
    result: Any = None
    error: str = None

class SimpleMCPClient:
    """
    Simplified MCP client for Docker-based Grafana server
    """
    
    def __init__(self):
        self.grafana_url = os.getenv("GRAFANA_URL", "https://your-grafana-instance.com")
        self.grafana_api_key = os.getenv("GRAFANA_API_KEY", "your-api-key-here")
        self.available_tools = [
            "search_dashboards",
            "list_datasources", 
            "query_prometheus",
            "query_loki_logs",
            "list_alert_rules",
            "get_dashboard_by_uid",
            "list_incidents"
        ]
    
    async def is_grafana_query(self, query: str) -> bool:
        """Check if query is related to Grafana"""
        grafana_keywords = [
            'grafana', 'dashboard', 'metric', 'datasource', 
            'prometheus', 'alert', 'panel', 'visualization'
        ]
        query_lower = query.lower()
        return any(keyword in query_lower for keyword in grafana_keywords)
    
    async def get_relevant_tools(self, query: str) -> List[str]:
        """Get tools relevant to the query"""
        if not await self.is_grafana_query(query):
            return []
        
        query_lower = query.lower()
        relevant_tools = []
        
        if any(word in query_lower for word in ['dashboard', 'list', 'show']):
            relevant_tools.append('search_dashboards')
        
        if any(word in query_lower for word in ['datasource', 'data source']):
            relevant_tools.append('list_datasources')
        
        if any(word in query_lower for word in ['search', 'find']):
            relevant_tools.append('search_dashboards')
        
        if any(word in query_lower for word in ['metric', 'query', 'prometheus']):
            relevant_tools.append('query_prometheus')
        
        if any(word in query_lower for word in ['logs', 'loki']):
            relevant_tools.append('query_loki_logs')
        
        if any(word in query_lower for word in ['alert', 'alerts']):
            relevant_tools.append('list_alert_rules')
        
        if any(word in query_lower for word in ['incident', 'incidents']):
            relevant_tools.append('list_incidents')
        
        # If no specific tools matched but it's a Grafana query, default to dashboards
        if not relevant_tools:
            relevant_tools.append('search_dashboards')
        
        return relevant_tools
    
    async def call_tool(self, tool_name: str, parameters: Dict[str, Any] = None) -> MCPToolResult:
        """
        Call a Grafana MCP tool using Docker
        """
        if tool_name not in self.available_tools:
            return MCPToolResult(
                tool_name=tool_name,
                success=False,
                error=f"Tool {tool_name} not available"
            )
        
        try:
            # Prepare the MCP request
            mcp_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": parameters or {}
                }
            }
            
            # Set up environment variables
            env = os.environ.copy()
            env.update({
                'GRAFANA_URL': self.grafana_url,
                'GRAFANA_API_KEY': self.grafana_api_key
            })
            
            # Use docker exec with the running container instead of docker run
            container_name = "jolly_cori"  # Use the running container
            
            # Create the process to execute the command in the running container
            process = await asyncio.create_subprocess_exec(
                'docker', 'exec', '-i', container_name, '/app/mcp-grafana',
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Send the request
            request_json = json.dumps(mcp_request) + '\n'
            stdout, stderr = await asyncio.wait_for(
                process.communicate(input=request_json.encode()),
                timeout=settings.mcp_client_timeout
            )
            
            if process.returncode != 0:
                logger.error(f"MCP process failed: {stderr.decode()}")
                return MCPToolResult(
                    tool_name=tool_name,
                    success=False,
                    error=f"Process failed: {stderr.decode()}"
                )
            
            # Parse the response
            response_text = stdout.decode().strip()
            if not response_text:
                return MCPToolResult(
                    tool_name=tool_name,
                    success=False,
                    error="No response from MCP server"
                )
            
            # Handle multiple JSON responses (common with MCP)
            lines = response_text.split('\n')
            for line in lines:
                if line.strip():
                    try:
                        response = json.loads(line)
                        if 'result' in response:
                            return MCPToolResult(
                                tool_name=tool_name,
                                success=True,
                                result=response['result']
                            )
                        elif 'error' in response:
                            return MCPToolResult(
                                tool_name=tool_name,
                                success=False,
                                error=response['error'].get('message', 'Unknown error')
                            )
                    except json.JSONDecodeError:
                        continue
            
            return MCPToolResult(
                tool_name=tool_name,
                success=False,
                error="Could not parse MCP response"
            )
            
        except asyncio.TimeoutError:
            logger.error(f"MCP tool call timed out after {settings.mcp_client_timeout} seconds: {tool_name}")
            return MCPToolResult(
                tool_name=tool_name,
                success=False,
                error=f"MCP tool call timed out after {settings.mcp_client_timeout} seconds. The Grafana server may be slow to respond."
            )
        except Exception as e:
            logger.error(f"Error calling MCP tool {tool_name}: {e}")
            return MCPToolResult(
                tool_name=tool_name,
                success=False,
                error=str(e)
            )
    
    async def call_multiple_tools(self, tool_names: List[str]) -> List[MCPToolResult]:
        """Call multiple tools in parallel"""
        tasks = [self.call_tool(tool_name) for tool_name in tool_names]
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    def format_tool_results(self, results: List[MCPToolResult]) -> str:
        """Format tool results for inclusion in AI context"""
        if not results:
            return ""
        
        formatted_results = []
        for result in results:
            if result.success and result.result:
                formatted_results.append(f"**{result.tool_name}**: {result.result}")
            elif not result.success:
                formatted_results.append(f"**{result.tool_name}**: Error - {result.error}")
        
        if formatted_results:
            return "Grafana Data:\n" + "\n".join(formatted_results)
        
        return ""

# Global instance
simple_mcp_client = SimpleMCPClient()