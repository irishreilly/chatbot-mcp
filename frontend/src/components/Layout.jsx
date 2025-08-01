import React from 'react'
import ConnectionStatus from './ConnectionStatus'
import './Layout.css'

const Layout = ({ children }) => {
  return (
    <div className="layout min-h-screen flex flex-col">
      <header className="layout-header">
        <div className="header-content container">
          <div className="header-main">
            <h1 className="app-title">MCP Chatbot</h1>
            <p className="app-subtitle">AI Assistant with MCP Integration</p>
          </div>
          <div className="header-status">
            <ConnectionStatus showDetails={true} />
          </div>
        </div>
      </header>
      <main className="layout-main flex-1 flex flex-col">
        <div className="container w-full h-full">
          {children}
        </div>
      </main>
      <footer className="layout-footer">
        <div className="container">
          <p>&copy; 2024 MCP Chatbot. Powered by AI and Model Context Protocol.</p>
        </div>
      </footer>
    </div>
  )
}

export default Layout