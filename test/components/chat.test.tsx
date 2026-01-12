import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Chat from '@/app/chat/page'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Chat Page', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should render chat page with message input', () => {
    render(<Chat />)

    expect(screen.getByTestId('chat_input_message')).toBeInTheDocument()
    expect(screen.getByTestId('chat_button_submit')).toBeInTheDocument()
  })

  it('should have submit button disabled when message is empty', () => {
    render(<Chat />)

    const submitButton = screen.getByTestId('chat_button_submit')
    expect(submitButton).toBeDisabled()
  })

  it('should enable submit button when message is entered', () => {
    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    const submitButton = screen.getByTestId('chat_button_submit')

    fireEvent.change(input, { target: { value: 'Create a hello world app' } })

    expect(submitButton).not.toBeDisabled()
  })

  it('should display placeholder text in textarea', () => {
    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    expect(input).toHaveAttribute('placeholder', 'Beschreibe deine Aufgabe detailliert...')
  })

  it('should update textarea value on input', () => {
    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    fireEvent.change(input, { target: { value: 'Test message' } })

    expect(input).toHaveValue('Test message')
  })

  it('should render file upload area', () => {
    render(<Chat />)

    expect(screen.getByText(/Dateien hierher ziehen/)).toBeInTheDocument()
  })

  it('should render dashboard link', () => {
    render(<Chat />)

    const link = screen.getByRole('link', { name: /Dashboard/i })
    expect(link).toHaveAttribute('href', '/dashboard')
  })
})
