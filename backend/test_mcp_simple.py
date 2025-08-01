#!/usr/bin/env python3
"""
Simple MCP test without complex dependencies
"""

import asyncio
import json
import subprocess
import os
import sys

async def test_mcp_grafana():
    print("🔍 Testing MCP Grafana Integration")
    print("=" * 50)
    
    # Test 1: Check if Docker image exists
    print("\n1. Docker Image Check:")
    try:
        result = subprocess.run(['docker', 'images', 'mcp/grafana', '--format', 'table'], 
                              capture_output=True, text=True)
        if 'mcp/grafana' in result.stdout:
            print("   ✓ MCP Grafana Docker image found")
        else:
            print("   ✗ MCP Grafana Docker image not found")
            return
    except Exception as e:
        print(f"   ✗ Error checking Docker image: {e}")
        return
    
    # Test 2: Try to run MCP server with environment variables
    print("\n2. MCP Server Test:")
    try:
        env = os.environ.copy()
        env.update({
            'GRAFANA_URL': os.getenv('GRAFANA_URL', 'https://your-grafana-instance.com'),
            'GRAFANA_API_KEY': os.getenv('GRAFANA_API_KEY', 'your-api-key-here')
        })
        
        # Test if the server can start (just check help)
        result = subprocess.run([
            'docker', 'run', '--rm', 
            '-e', f'GRAFANA_URL={os.getenv("GRAFANA_URL", "https://your-grafana-instance.com")}',
            '-e', f'GRAFANA_API_KEY={os.getenv("GRAFANA_API_KEY", "your-api-key-here")}',
            'mcp/grafana', '--version'
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            print(f"   ✓ MCP Grafana server can start: {result.stdout.strip()}")
        else:
            print(f"   ✗ MCP Grafana server failed to start: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        print("   ⚠️  MCP server test timed out (this might be normal)")
    except Exception as e:
        print(f"   ✗ Error testing MCP server: {e}")
    
    # Test 3: Check configuration format
    print("\n3. Configuration Check:")
    try:
        with open('mcp_config.json', 'r') as f:
            config = json.load(f)
        
        servers = config.get('servers', [])
        print(f"   ✓ Found {len(servers)} server(s) in config")
        
        for server in servers:
            name = server.get('name', 'unnamed')
            enabled = server.get('enabled', False)
            endpoint = server.get('endpoint', 'no endpoint')
            print(f"     - {name}: {endpoint} ({'enabled' if enabled else 'disabled'})")
            
    except FileNotFoundError:
        print("   ✗ mcp_config.json not found")
    except Exception as e:
        print(f"   ✗ Error reading config: {e}")
    
    print("\n" + "=" * 50)
    print("💡 Next steps:")
    print("   1. If Docker image test passed, MCP server is available")
    print("   2. If config test passed, configuration format is correct")
    print("   3. Ready to integrate MCP into the backend")

if __name__ == "__main__":
    asyncio.run(test_mcp_grafana())