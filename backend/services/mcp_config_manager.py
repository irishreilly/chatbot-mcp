"""
MCP Server Configuration Manager
Handles loading, validation, and management of MCP server configurations
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import ValidationError

from models.mcp import MCPServerConfig

logger = logging.getLogger(__name__)


class MCPConfigurationError(Exception):
    """Raised when MCP configuration is invalid or cannot be loaded"""
    pass


class MCPConfigManager:
    """
    Manages MCP server configurations including loading from files,
    validation, and dynamic updates
    """
    
    def __init__(self, config_file_path: Optional[str] = None):
        self.config_file_path = config_file_path or "mcp_config.json"
        self.servers: Dict[str, MCPServerConfig] = {}
        self._config_data: Dict[str, Any] = {}
        
    def load_configuration(self, config_file_path: Optional[str] = None) -> None:
        """
        Load MCP server configurations from JSON file
        
        Args:
            config_file_path: Optional path to config file, uses default if not provided
            
        Raises:
            MCPConfigurationError: If configuration file cannot be loaded or is invalid
        """
        file_path = config_file_path or self.config_file_path
        
        try:
            config_path = Path(file_path)
            
            if not config_path.exists():
                logger.warning(f"MCP config file not found: {file_path}. Using empty configuration.")
                self._config_data = {"servers": []}
                self.servers = {}
                return
            
            with open(config_path, 'r', encoding='utf-8') as f:
                self._config_data = json.load(f)
            
            self._validate_and_load_servers()
            logger.info(f"Loaded {len(self.servers)} MCP server configurations from {file_path}")
            
        except json.JSONDecodeError as e:
            raise MCPConfigurationError(f"Invalid JSON in config file {file_path}: {str(e)}")
        except Exception as e:
            raise MCPConfigurationError(f"Failed to load config file {file_path}: {str(e)}")
    
    def _validate_and_load_servers(self) -> None:
        """Validate and load server configurations from config data"""
        servers_data = self._config_data.get("servers", [])
        
        if not isinstance(servers_data, list):
            raise MCPConfigurationError("'servers' must be a list in configuration file")
        
        self.servers = {}
        
        for i, server_data in enumerate(servers_data):
            try:
                server_config = MCPServerConfig(**server_data)
                
                if server_config.name in self.servers:
                    raise MCPConfigurationError(f"Duplicate server name: {server_config.name}")
                
                self.servers[server_config.name] = server_config
                
            except ValidationError as e:
                raise MCPConfigurationError(f"Invalid server configuration at index {i}: {str(e)}")
            except Exception as e:
                raise MCPConfigurationError(f"Error processing server configuration at index {i}: {str(e)}")
    
    def save_configuration(self, config_file_path: Optional[str] = None) -> None:
        """
        Save current server configurations to JSON file
        
        Args:
            config_file_path: Optional path to save config file, uses default if not provided
            
        Raises:
            MCPConfigurationError: If configuration cannot be saved
        """
        file_path = config_file_path or self.config_file_path
        
        try:
            # Convert server configs to dict format
            servers_data = []
            for server in self.servers.values():
                server_dict = server.model_dump()
                servers_data.append(server_dict)
            
            config_data = {
                "servers": servers_data
            }
            
            # Preserve any additional configuration data
            if self._config_data:
                for key, value in self._config_data.items():
                    if key != "servers":
                        config_data[key] = value
            
            config_path = Path(file_path)
            config_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved {len(self.servers)} MCP server configurations to {file_path}")
            
        except Exception as e:
            raise MCPConfigurationError(f"Failed to save config file {file_path}: {str(e)}")
    
    def add_server(self, server_config: MCPServerConfig) -> None:
        """
        Add a new server configuration
        
        Args:
            server_config: Server configuration to add
            
        Raises:
            MCPConfigurationError: If server name already exists
        """
        if server_config.name in self.servers:
            raise MCPConfigurationError(f"Server with name '{server_config.name}' already exists")
        
        self.servers[server_config.name] = server_config
        logger.info(f"Added MCP server configuration: {server_config.name}")
    
    def update_server(self, server_name: str, server_config: MCPServerConfig) -> None:
        """
        Update an existing server configuration
        
        Args:
            server_name: Name of server to update
            server_config: New server configuration
            
        Raises:
            MCPConfigurationError: If server doesn't exist or name mismatch
        """
        if server_name not in self.servers:
            raise MCPConfigurationError(f"Server '{server_name}' not found")
        
        if server_config.name != server_name:
            raise MCPConfigurationError("Server name cannot be changed during update")
        
        self.servers[server_name] = server_config
        logger.info(f"Updated MCP server configuration: {server_name}")
    
    def remove_server(self, server_name: str) -> None:
        """
        Remove a server configuration
        
        Args:
            server_name: Name of server to remove
            
        Raises:
            MCPConfigurationError: If server doesn't exist
        """
        if server_name not in self.servers:
            raise MCPConfigurationError(f"Server '{server_name}' not found")
        
        del self.servers[server_name]
        logger.info(f"Removed MCP server configuration: {server_name}")
    
    def get_server(self, server_name: str) -> Optional[MCPServerConfig]:
        """
        Get a server configuration by name
        
        Args:
            server_name: Name of server to retrieve
            
        Returns:
            Server configuration or None if not found
        """
        return self.servers.get(server_name)
    
    def get_all_servers(self) -> Dict[str, MCPServerConfig]:
        """
        Get all server configurations
        
        Returns:
            Dictionary of server name to configuration mappings
        """
        return self.servers.copy()
    
    def get_enabled_servers(self) -> Dict[str, MCPServerConfig]:
        """
        Get only enabled server configurations
        
        Returns:
            Dictionary of enabled server configurations
        """
        return {
            name: config for name, config in self.servers.items()
            if config.enabled
        }
    
    def enable_server(self, server_name: str) -> None:
        """
        Enable a server configuration
        
        Args:
            server_name: Name of server to enable
            
        Raises:
            MCPConfigurationError: If server doesn't exist
        """
        if server_name not in self.servers:
            raise MCPConfigurationError(f"Server '{server_name}' not found")
        
        self.servers[server_name].enabled = True
        logger.info(f"Enabled MCP server: {server_name}")
    
    def disable_server(self, server_name: str) -> None:
        """
        Disable a server configuration
        
        Args:
            server_name: Name of server to disable
            
        Raises:
            MCPConfigurationError: If server doesn't exist
        """
        if server_name not in self.servers:
            raise MCPConfigurationError(f"Server '{server_name}' not found")
        
        self.servers[server_name].enabled = False
        logger.info(f"Disabled MCP server: {server_name}")
    
    def validate_server_config(self, server_data: Dict[str, Any]) -> MCPServerConfig:
        """
        Validate server configuration data
        
        Args:
            server_data: Dictionary containing server configuration
            
        Returns:
            Validated MCPServerConfig instance
            
        Raises:
            MCPConfigurationError: If configuration is invalid
        """
        try:
            return MCPServerConfig(**server_data)
        except ValidationError as e:
            raise MCPConfigurationError(f"Invalid server configuration: {str(e)}")
    
    def reload_configuration(self) -> None:
        """
        Reload configuration from file
        
        Raises:
            MCPConfigurationError: If configuration cannot be reloaded
        """
        logger.info("Reloading MCP server configuration")
        self.load_configuration()
    
    def get_server_count(self) -> int:
        """Get total number of configured servers"""
        return len(self.servers)
    
    def get_enabled_server_count(self) -> int:
        """Get number of enabled servers"""
        return len(self.get_enabled_servers())
    
    def has_server(self, server_name: str) -> bool:
        """Check if a server configuration exists"""
        return server_name in self.servers
    
    def get_server_names(self) -> List[str]:
        """Get list of all server names"""
        return list(self.servers.keys())
    
    def get_enabled_server_names(self) -> List[str]:
        """Get list of enabled server names"""
        return [name for name, config in self.servers.items() if config.enabled]
    
    def create_server_from_dict(self, server_data: Dict[str, Any]) -> MCPServerConfig:
        """
        Create and validate a server configuration from dictionary data
        
        Args:
            server_data: Dictionary containing server configuration
            
        Returns:
            Validated MCPServerConfig instance
            
        Raises:
            MCPConfigurationError: If configuration is invalid
        """
        return self.validate_server_config(server_data)
    
    def export_configuration(self) -> Dict[str, Any]:
        """
        Export current configuration as dictionary
        
        Returns:
            Configuration dictionary suitable for JSON serialization
        """
        servers_data = []
        for server in self.servers.values():
            servers_data.append(server.model_dump())
        
        config_data = {"servers": servers_data}
        
        # Include any additional configuration data
        if self._config_data:
            for key, value in self._config_data.items():
                if key != "servers":
                    config_data[key] = value
        
        return config_data
    
    def import_configuration(self, config_data: Dict[str, Any]) -> None:
        """
        Import configuration from dictionary
        
        Args:
            config_data: Configuration dictionary
            
        Raises:
            MCPConfigurationError: If configuration is invalid
        """
        # Validate the configuration data first
        if not isinstance(config_data, dict):
            raise MCPConfigurationError("Configuration data must be a dictionary")
        
        # Store the config data and validate servers
        self._config_data = config_data
        self._validate_and_load_servers()
        
        logger.info(f"Imported {len(self.servers)} MCP server configurations")
    
    def __str__(self) -> str:
        enabled_count = self.get_enabled_server_count()
        total_count = self.get_server_count()
        return f"MCPConfigManager({enabled_count}/{total_count} servers enabled)"
    
    def __repr__(self) -> str:
        return f"MCPConfigManager(config_file='{self.config_file_path}', servers={len(self.servers)})"