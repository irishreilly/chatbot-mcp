import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Layout from './Layout'

describe('Layout', () => {
  it('renders the header with app title and subtitle', () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    )
    
    expect(screen.getByText('MCP Chatbot')).toBeInTheDocument()
    expect(screen.getByText('AI Assistant with MCP Integration')).toBeInTheDocument()
  })

  it('renders children content in the main section', () => {
    const testContent = 'Test content for layout'
    render(
      <Layout>
        <div>{testContent}</div>
      </Layout>
    )
    
    expect(screen.getByText(testContent)).toBeInTheDocument()
  })

  it('renders the footer with copyright information', () => {
    render(
      <Layout>
        <div>Test content</div>
      </Layout>
    )
    
    expect(screen.getByText(/© 2024 MCP Chatbot/)).toBeInTheDocument()
    expect(screen.getByText(/Powered by AI and Model Context Protocol/)).toBeInTheDocument()
  })

  it('has proper CSS classes for responsive design', () => {
    const { container } = render(
      <Layout>
        <div>Test content</div>
      </Layout>
    )
    
    const layoutDiv = container.firstChild
    expect(layoutDiv).toHaveClass('layout', 'min-h-screen', 'flex', 'flex-col')
  })
})