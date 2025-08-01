import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the main app title', () => {
    render(<App />)
    expect(screen.getByText('MCP Chatbot')).toBeInTheDocument()
  })

  it('renders the app subtitle', () => {
    render(<App />)
    expect(screen.getByText('AI Assistant with MCP Integration')).toBeInTheDocument()
  })

  it('renders the welcome message', () => {
    render(<App />)
    expect(screen.getByText('Welcome to MCP Chatbot')).toBeInTheDocument()
  })
})