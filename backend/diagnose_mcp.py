#!/usr/bin/env python3
"""
Diagnostic tool to identify MCP integration issues
"""

import sys
import asyncio
import json
import httpx
sys.path.append('.')

from config import settings

async def diagnose_mcp():
    print("🔍 MCP Integration Diagnostic Tool")
    print("=" * 50)
    
    # 1. Check MCP configuration file
    print("\n1. MCP Configuration Check:")
    try:
        with open('mcp_config.json', 'r') as f:
            config = json.load(f)
        
        print(f"   ✓ MCP config file loaded successfully")
        servers = config.get('servers', [])
        print(f"   Found {len(servers)} server(s) configured:")
        
        for server in servers:
            name = server.get('name', 'unnamed')
            endpoint = server.get('endpoint', 'no endpoint')
            enabled = server.get('enabled', False)
            status = "✓ enabled" if enabled else "✗ disabled"
            print(f"     - {name}: {endpoint} ({status})")
            
    except FileNotFoundError:
        print("   ✗ MCP config file not found")
        return
    except json.JSONDecodeError as e:
        print(f"   ✗ Invalid JSON in MCP config: {e}")
        return
    except Exception as e:
        print(f"   ✗ Error reading MCP config: {e}")
        return
    
    # 2. Test connectivity to configured endpoints
    print("\n2. MCP Server Connectivity Test:")
    enabled_servers = [s for s in servers if s.get('enabled', False)]
    
    if not enabled_servers:
        print("   ⚠️  No enabled MCP servers found")
        return
    
    for server in enabled_servers:
        name = server.get('name', 'unnamed')
        endpoint = server.get('endpoint', '')
        
        print(f"   Testing {name} at {endpoint}...")
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try to connect to the endpoint
                response = await client.get(endpoint)
                print(f"     ✓ {name} is responding (status: {response.status_code})")
                
        except httpx.ConnectError:
            print(f"     ✗ Cannot connect to {name} - server may not be running")
        except httpx.TimeoutException:
            print(f"     ✗ Timeout connecting to {name}")
        except Exception as e:
            print(f"     ✗ Error connecting to {name}: {e}")
    
    # 3. Test MCP configuration loading
    print("\n3. MCP Configuration Loading Test:")
    try:
        from services.mcp_config_manager import MCPConfigManager
        
        config_manager = MCPConfigManager()
        config_manager.load_configuration()
        
        print(f"   ✓ MCP configuration loaded successfully")
        print(f"   Loaded {len(config_manager.servers)} server(s):")
        
        for name, server_config in config_manager.servers.items():
            print(f"     - {name}: {server_config.endpoint} (enabled: {server_config.enabled})")
            
    except Exception as e:
        print(f"   ✗ MCP configuration loading failed: {e}")
        import traceback
        traceback.print_exc()
    
    # 4. Test MCP client manager initialization
    print("\n4. MCP Client Manager Test:")
    try:
        from services.mcp_client_manager import MCPClientManager
        from services.mcp_config_manager import MCPConfigManager
        
        config_manager = MCPConfigManager()
        config_manager.load_configuration()
        
        # Only test with enabled servers
        enabled_configs = {name: config for name, config in config_manager.servers.items() if config.enabled}
        
        if enabled_configs:
            print(f"   Initializing MCP client manager with {len(enabled_configs)} enabled server(s)...")
            client_manager = MCPClientManager(enabled_configs)
            print("   ✓ MCP client manager initialized successfully")
            
            # Test server connections
            print("   Testing server connections...")
            for server_name in enabled_configs.keys():
                try:
                    # This might hang if the server is not responding
                    print(f"     Testing connection to {server_name}...")
                    # Add timeout here if needed
                    
                except Exception as e:
                    print(f"     ✗ Failed to connect to {server_name}: {e}")
        else:
            print("   ⚠️  No enabled servers to test")
            
    except Exception as e:
        print(f"   ✗ MCP client manager test failed: {e}")
        import traceback
        traceback.print_exc()
    
    # 5. Recommendations
    print("\n5. Recommendations:")
    
    # Check if Grafana is running
    grafana_server = next((s for s in servers if s.get('name') == 'grafana'), None)
    if grafana_server and grafana_server.get('enabled'):
        print("   🔧 Make sure Grafana is running on http://localhost:3000")
        print("   🔧 Or disable the Grafana MCP server in mcp_config.json")
    
    print("   🔧 Try disabling all MCP servers temporarily to see if the backend starts")
    print("   🔧 Check backend console output for detailed error messages")
    print("   🔧 Consider adding timeout settings to MCP connections")
    
    print("\n" + "=" * 50)
    print("💡 To temporarily disable MCP, set 'enabled': false for all servers")
    print("💡 Check if the MCP server (Grafana) is actually running and accessible")

if __name__ == "__main__":
    asyncio.run(diagnose_mcp())