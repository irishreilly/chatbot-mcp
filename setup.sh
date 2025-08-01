#!/bin/bash

# MCP Chatbot Web Application Setup Script

echo "Setting up MCP Chatbot Web Application..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    exit 1
fi

# Setup Python virtual environment
echo "Setting up Python virtual environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

# Activate virtual environment and install dependencies
echo "Installing Python dependencies..."
source .venv/bin/activate
pip install -r requirements.txt

# Setup frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit .env file with your API keys"
fi

echo "Setup complete!"
echo ""
echo "To start development:"
echo "1. Backend: source .venv/bin/activate && cd backend && nohup python main.py > backend.log 2>&1 &"
echo "2. Frontend: cd frontend && nohup npm run dev > frontend.log 2>&1 &"
echo ""
echo "Don't forget to configure your API keys in the .env file!"