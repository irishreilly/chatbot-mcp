#!/usr/bin/env python3
"""
Manual integration test for the MCP Chatbot webapp.
This script tests the backend API endpoints to verify the integration is working.
"""

import requests
import json
import time

# Configuration
BACKEND_URL = "http://localhost:8000"
API_BASE = f"{BACKEND_URL}/api"

def test_health_endpoint():
    """Test the health check endpoint"""
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{API_BASE}/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed: {data}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_chat_endpoint():
    """Test the chat endpoint"""
    print("\nTesting chat endpoint...")
    try:
        payload = {
            "message": "Hello, this is a test message from the integration test!"
        }
        
        response = requests.post(
            f"{API_BASE}/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Chat endpoint passed:")
            print(f"   Response: {data['response'][:100]}...")
            print(f"   Conversation ID: {data['conversation_id']}")
            print(f"   MCP Tools Used: {data['mcp_tools_used']}")
            return True, data['conversation_id']
        else:
            print(f"❌ Chat endpoint failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False, None
    except Exception as e:
        print(f"❌ Chat endpoint error: {e}")
        return False, None

def test_conversation_continuity(conversation_id):
    """Test conversation continuity"""
    print(f"\nTesting conversation continuity with ID: {conversation_id}")
    try:
        payload = {
            "message": "Can you remember what I just said?",
            "conversation_id": conversation_id
        }
        
        response = requests.post(
            f"{API_BASE}/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Conversation continuity passed:")
            print(f"   Response: {data['response'][:100]}...")
            print(f"   Same Conversation ID: {data['conversation_id'] == conversation_id}")
            return True
        else:
            print(f"❌ Conversation continuity failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Conversation continuity error: {e}")
        return False

def main():
    """Run all integration tests"""
    print("🚀 Starting MCP Chatbot Integration Tests")
    print("=" * 50)
    
    # Test 1: Health check
    health_ok = test_health_endpoint()
    
    if not health_ok:
        print("\n❌ Backend is not running or not healthy. Please start the backend first:")
        print("   cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8888")
        return
    
    # Test 2: Chat endpoint
    chat_ok, conversation_id = test_chat_endpoint()
    
    if not chat_ok:
        print("\n❌ Chat endpoint failed. Check backend logs for errors.")
        return
    
    # Test 3: Conversation continuity
    continuity_ok = test_conversation_continuity(conversation_id)
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Integration Test Summary:")
    print(f"   Health Check: {'✅ PASS' if health_ok else '❌ FAIL'}")
    print(f"   Chat Endpoint: {'✅ PASS' if chat_ok else '❌ FAIL'}")
    print(f"   Conversation Continuity: {'✅ PASS' if continuity_ok else '❌ FAIL'}")
    
    if health_ok and chat_ok and continuity_ok:
        print("\n🎉 All integration tests passed! The frontend-backend integration is working correctly.")
        print("\nNext steps:")
        print("1. Start the frontend: cd frontend && npm run dev")
        print("2. Open http://localhost:5173 in your browser")
        print("3. Test the chat interface manually")
    else:
        print("\n❌ Some tests failed. Please check the backend implementation.")

if __name__ == "__main__":
    main()