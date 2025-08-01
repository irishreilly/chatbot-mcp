# MCP Chatbot Web Application

A fully functional, full-stack, chatbot web application with a JavaScript frontend and Python backend. It can serve as a client that can leverage Model Context Protocol servers for enhanced AI responses. It was successfully tested with Grafana integration using Docker to run the local MCP server, which in turn referenced a Grafana server via a service account token. It also includes conversational memory, a UI status indicator, error handling, and the ability to fallback on an Anthropic model if the primary OpenAI model is inaccessible for chat. 

## Architecture

- **Frontend**: React application with Vite build tool
- **Backend**: FastAPI Python server
- **AI Integration**: Support for OpenAI and Anthropic APIs
- **MCP Integration**: Configurable MCP servers for external tools

## Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

## Quick Start

1. **Automated Setup**:

   ```bash
   ./setup.sh
   ```

2. **Manual Setup Alternative**:

   **Backend Setup**:

   ```bash
   # Create virtual environment
   python3 -m venv .venv
   source .venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

   **Frontend Setup**:

   ```bash
   cd frontend
   npm install
   ```

3. **Configuration**:

- Ensure the .env file exists in the project root and update that .env file with the necessary keys and configuration
- Configure MCP servers via the mcp_config.json file. A sample is provided referencing a Grafana MCP server in Docker

## Development

**Start Backend**:

```bash
source .venv/bin/activate
cd backend
nohup python main.py > backend.log 2>&1 &
```

**Start Frontend** (in a new terminal):

```bash
cd frontend
nohup npm run dev > frontend.log 2>&1 &
```

The application will be available at:

- Frontend: <http://localhost:8080>
- Backend API: <http://localhost:8000>
- API Documentation: <http://localhost:8000/docs>

## Project Structure

```
├── backend/                 # Python FastAPI backend
│   ├── api/                # API endpoints
│   ├── models/             # Data models
│   ├── services/           # Business logic
│   ├── config.py           # Configuration
│   └── main.py             # Application entry point
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API clients
│   │   ├── utils/          # Utilities
│   │   └── test/           # Test setup
│   ├── package.json        # Frontend dependencies
│   └── vite.config.js      # Build configuration
├── .env.example            # Environment template
├── mcp_config.json         # MCP server configuration
├── requirements.txt        # Python dependencies
└── setup.sh               # Setup script
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: OpenAI API key for AI responses (primary provider)
- `ANTHROPIC_API_KEY`: Anthropic API key for AI responses (fallback provider)
- `DEBUG`: Enable debug mode
- `API_HOST`: Backend host (default: 0.0.0.0)
- `API_PORT`: Backend port (default: 8000)

**Note**: The application will use OpenAI as the primary AI provider if an API key is configured, falling back to Anthropic if only that key is available.

### MCP Servers

Configure MCP servers in `mcp_config.json`:

```json
{
  "servers": [
    {
      "name": "example-server",
      "endpoint": "http://localhost:3001",
      "authentication": {},
      "enabled": true
    }
  ]
}
```

## Testing

**Backend Tests**:

```bash
source .venv/bin/activate
pytest
```

**Frontend Tests**:

```bash
cd frontend
npm test
```

## API Documentation

Once the backend is running, visit <http://localhost:8000/docs> for interactive API documentation.

## License

MIT License
