"""
Unit tests for MCP Configuration Manager
"""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, mock_open

from backend.models.mcp import MCPServerConfig
from backend.services.mcp_config_manager import MCPConfigManager, MCPConfigurationError


@pytest.fixture
def sample_server_config():
    """Sample server configuration for testing"""
    return {
        "name": "test-server",
        "endpoint": "http://localhost:8001",
        "authentication": {"api_key": "test-key"},
        "available_tools": ["tool1", "tool2"],
        "enabled": True,
        "timeout": 30,
        "max_retries": 3
    }


@pytest.fixture
def sample_config_data(sample_server_config):
    """Sample configuration file data"""
    return {
        "servers": [
            sample_server_config,
            {
                "name": "another-server",
                "endpoint": "ws://localhost:8002",
                "authentication": {},
                "available_tools": [],
                "enabled": False,
                "timeout": 15,
                "max_retries": 2
            }
        ]
    }


@pytest.fixture
def temp_config_file(sample_config_data):
    """Create a temporary config file for testing"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(sample_config_data, f)
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    Path(temp_path).unlink(missing_ok=True)


class TestMCPConfigManager:
    """Test cases for MCPConfigManager"""
    
    def test_init(self):
        """Test manager initialization"""
        manager = MCPConfigManager()
        
        assert manager.config_file_path == "mcp_config.json"
        assert manager.servers == {}
        assert manager._config_data == {}
    
    def test_init_with_custom_path(self):
        """Test manager initialization with custom config path"""
        custom_path = "/custom/path/config.json"
        manager = MCPConfigManager(custom_path)
        
        assert manager.config_file_path == custom_path
    
    def test_load_configuration_success(self, temp_config_file):
        """Test successful configuration loading"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert len(manager.servers) == 2
        assert "test-server" in manager.servers
        assert "another-server" in manager.servers
        
        test_server = manager.servers["test-server"]
        assert test_server.name == "test-server"
        assert test_server.endpoint == "http://localhost:8001"
        assert test_server.enabled is True
    
    def test_load_configuration_file_not_found(self):
        """Test loading configuration when file doesn't exist"""
        manager = MCPConfigManager()
        manager.load_configuration("nonexistent_file.json")
        
        assert len(manager.servers) == 0
        assert manager._config_data == {"servers": []}
    
    def test_load_configuration_invalid_json(self):
        """Test loading configuration with invalid JSON"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("invalid json content")
            temp_path = f.name
        
        try:
            manager = MCPConfigManager()
            with pytest.raises(MCPConfigurationError, match="Invalid JSON"):
                manager.load_configuration(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_load_configuration_invalid_server_config(self):
        """Test loading configuration with invalid server data"""
        invalid_config = {
            "servers": [
                {
                    "name": "",  # Invalid: empty name
                    "endpoint": "http://localhost:8001"
                }
            ]
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(invalid_config, f)
            temp_path = f.name
        
        try:
            manager = MCPConfigManager()
            with pytest.raises(MCPConfigurationError, match="Invalid server configuration"):
                manager.load_configuration(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_load_configuration_duplicate_server_names(self):
        """Test loading configuration with duplicate server names"""
        duplicate_config = {
            "servers": [
                {
                    "name": "duplicate-server",
                    "endpoint": "http://localhost:8001",
                    "authentication": {},
                    "enabled": True
                },
                {
                    "name": "duplicate-server",
                    "endpoint": "http://localhost:8002",
                    "authentication": {},
                    "enabled": True
                }
            ]
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(duplicate_config, f)
            temp_path = f.name
        
        try:
            manager = MCPConfigManager()
            with pytest.raises(MCPConfigurationError, match="Duplicate server name"):
                manager.load_configuration(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_save_configuration(self, sample_server_config):
        """Test saving configuration to file"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        manager.add_server(server_config)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = f.name
        
        try:
            manager.save_configuration(temp_path)
            
            # Verify file was created and contains correct data
            with open(temp_path, 'r') as f:
                saved_data = json.load(f)
            
            assert "servers" in saved_data
            assert len(saved_data["servers"]) == 1
            assert saved_data["servers"][0]["name"] == "test-server"
            
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_add_server(self, sample_server_config):
        """Test adding a server configuration"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        
        manager.add_server(server_config)
        
        assert len(manager.servers) == 1
        assert "test-server" in manager.servers
        assert manager.servers["test-server"] == server_config
    
    def test_add_server_duplicate_name(self, sample_server_config):
        """Test adding server with duplicate name"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        
        manager.add_server(server_config)
        
        with pytest.raises(MCPConfigurationError, match="already exists"):
            manager.add_server(server_config)
    
    def test_update_server(self, sample_server_config):
        """Test updating a server configuration"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        manager.add_server(server_config)
        
        # Update the configuration
        updated_config_data = sample_server_config.copy()
        updated_config_data["timeout"] = 60
        updated_server_config = MCPServerConfig(**updated_config_data)
        
        manager.update_server("test-server", updated_server_config)
        
        assert manager.servers["test-server"].timeout == 60
    
    def test_update_server_not_found(self, sample_server_config):
        """Test updating non-existent server"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        
        with pytest.raises(MCPConfigurationError, match="not found"):
            manager.update_server("nonexistent-server", server_config)
    
    def test_update_server_name_mismatch(self, sample_server_config):
        """Test updating server with name mismatch"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        manager.add_server(server_config)
        
        # Try to update with different name
        different_name_config = sample_server_config.copy()
        different_name_config["name"] = "different-name"
        updated_server_config = MCPServerConfig(**different_name_config)
        
        with pytest.raises(MCPConfigurationError, match="name cannot be changed"):
            manager.update_server("test-server", updated_server_config)
    
    def test_remove_server(self, sample_server_config):
        """Test removing a server configuration"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        manager.add_server(server_config)
        
        assert len(manager.servers) == 1
        
        manager.remove_server("test-server")
        
        assert len(manager.servers) == 0
        assert "test-server" not in manager.servers
    
    def test_remove_server_not_found(self):
        """Test removing non-existent server"""
        manager = MCPConfigManager()
        
        with pytest.raises(MCPConfigurationError, match="not found"):
            manager.remove_server("nonexistent-server")
    
    def test_get_server(self, sample_server_config):
        """Test getting a server configuration"""
        manager = MCPConfigManager()
        server_config = MCPServerConfig(**sample_server_config)
        manager.add_server(server_config)
        
        retrieved_config = manager.get_server("test-server")
        
        assert retrieved_config is not None
        assert retrieved_config.name == "test-server"
    
    def test_get_server_not_found(self):
        """Test getting non-existent server"""
        manager = MCPConfigManager()
        
        retrieved_config = manager.get_server("nonexistent-server")
        
        assert retrieved_config is None
    
    def test_get_all_servers(self, temp_config_file):
        """Test getting all server configurations"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        all_servers = manager.get_all_servers()
        
        assert len(all_servers) == 2
        assert "test-server" in all_servers
        assert "another-server" in all_servers
        
        # Ensure it's a copy
        all_servers["new-server"] = None
        assert "new-server" not in manager.servers
    
    def test_get_enabled_servers(self, temp_config_file):
        """Test getting only enabled server configurations"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        enabled_servers = manager.get_enabled_servers()
        
        assert len(enabled_servers) == 1
        assert "test-server" in enabled_servers
        assert "another-server" not in enabled_servers
    
    def test_enable_server(self, temp_config_file):
        """Test enabling a server"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert not manager.servers["another-server"].enabled
        
        manager.enable_server("another-server")
        
        assert manager.servers["another-server"].enabled
    
    def test_enable_server_not_found(self):
        """Test enabling non-existent server"""
        manager = MCPConfigManager()
        
        with pytest.raises(MCPConfigurationError, match="not found"):
            manager.enable_server("nonexistent-server")
    
    def test_disable_server(self, temp_config_file):
        """Test disabling a server"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert manager.servers["test-server"].enabled
        
        manager.disable_server("test-server")
        
        assert not manager.servers["test-server"].enabled
    
    def test_disable_server_not_found(self):
        """Test disabling non-existent server"""
        manager = MCPConfigManager()
        
        with pytest.raises(MCPConfigurationError, match="not found"):
            manager.disable_server("nonexistent-server")
    
    def test_validate_server_config(self, sample_server_config):
        """Test server configuration validation"""
        manager = MCPConfigManager()
        
        validated_config = manager.validate_server_config(sample_server_config)
        
        assert isinstance(validated_config, MCPServerConfig)
        assert validated_config.name == "test-server"
    
    def test_validate_server_config_invalid(self):
        """Test server configuration validation with invalid data"""
        manager = MCPConfigManager()
        invalid_config = {
            "name": "",  # Invalid: empty name
            "endpoint": "http://localhost:8001"
        }
        
        with pytest.raises(MCPConfigurationError, match="Invalid server configuration"):
            manager.validate_server_config(invalid_config)
    
    def test_reload_configuration(self, temp_config_file):
        """Test reloading configuration"""
        manager = MCPConfigManager(temp_config_file)
        manager.load_configuration()
        
        assert len(manager.servers) == 2
        
        # Clear servers and reload
        manager.servers = {}
        manager.reload_configuration()
        
        assert len(manager.servers) == 2
    
    def test_get_server_count(self, temp_config_file):
        """Test getting server count"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert manager.get_server_count() == 2
    
    def test_get_enabled_server_count(self, temp_config_file):
        """Test getting enabled server count"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert manager.get_enabled_server_count() == 1
    
    def test_has_server(self, temp_config_file):
        """Test checking if server exists"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        assert manager.has_server("test-server") is True
        assert manager.has_server("nonexistent-server") is False
    
    def test_get_server_names(self, temp_config_file):
        """Test getting server names"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        names = manager.get_server_names()
        
        assert len(names) == 2
        assert "test-server" in names
        assert "another-server" in names
    
    def test_get_enabled_server_names(self, temp_config_file):
        """Test getting enabled server names"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        enabled_names = manager.get_enabled_server_names()
        
        assert len(enabled_names) == 1
        assert "test-server" in enabled_names
        assert "another-server" not in enabled_names
    
    def test_create_server_from_dict(self, sample_server_config):
        """Test creating server from dictionary"""
        manager = MCPConfigManager()
        
        server_config = manager.create_server_from_dict(sample_server_config)
        
        assert isinstance(server_config, MCPServerConfig)
        assert server_config.name == "test-server"
    
    def test_export_configuration(self, temp_config_file):
        """Test exporting configuration"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        exported_config = manager.export_configuration()
        
        assert "servers" in exported_config
        assert len(exported_config["servers"]) == 2
        assert exported_config["servers"][0]["name"] in ["test-server", "another-server"]
    
    def test_import_configuration(self, sample_config_data):
        """Test importing configuration"""
        manager = MCPConfigManager()
        
        manager.import_configuration(sample_config_data)
        
        assert len(manager.servers) == 2
        assert "test-server" in manager.servers
        assert "another-server" in manager.servers
    
    def test_import_configuration_invalid(self):
        """Test importing invalid configuration"""
        manager = MCPConfigManager()
        
        with pytest.raises(MCPConfigurationError, match="must be a dictionary"):
            manager.import_configuration("invalid data")
    
    def test_str_representation(self, temp_config_file):
        """Test string representation"""
        manager = MCPConfigManager()
        manager.load_configuration(temp_config_file)
        
        str_repr = str(manager)
        
        assert "1/2 servers enabled" in str_repr
    
    def test_repr_representation(self):
        """Test repr representation"""
        manager = MCPConfigManager("custom_config.json")
        
        repr_str = repr(manager)
        
        assert "custom_config.json" in repr_str
        assert "servers=0" in repr_str
    
    def test_servers_not_list_error(self):
        """Test error when servers is not a list"""
        invalid_config = {
            "servers": "not a list"
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(invalid_config, f)
            temp_path = f.name
        
        try:
            manager = MCPConfigManager()
            with pytest.raises(MCPConfigurationError, match="'servers' must be a list"):
                manager.load_configuration(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_preserve_additional_config_data(self):
        """Test that additional configuration data is preserved"""
        config_with_extra = {
            "servers": [],
            "version": "1.0",
            "metadata": {"created_by": "test"}
        }
        
        manager = MCPConfigManager()
        manager.import_configuration(config_with_extra)
        
        exported = manager.export_configuration()
        
        assert exported["version"] == "1.0"
        assert exported["metadata"]["created_by"] == "test"