import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Chat from '@/app/chat/page'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Chat Page', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('should render chat page with all test IDs', () => {
    render(<Chat />)

    expect(screen.getByTestId('chat_page')).toBeInTheDocument()
    expect(screen.getByTestId('chat_title')).toBeInTheDocument()
    expect(screen.getByTestId('chat_description')).toBeInTheDocument()
    expect(screen.getByTestId('chat_form')).toBeInTheDocument()
    expect(screen.getByTestId('chat_input_message')).toBeInTheDocument()
    expect(screen.getByTestId('chat_button_submit')).toBeInTheDocument()
    expect(screen.getByTestId('chat_text_hint')).toBeInTheDocument()
    expect(screen.getByTestId('chat_section_tips')).toBeInTheDocument()
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

  it('should show character count', () => {
    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    const hint = screen.getByTestId('chat_text_hint')

    expect(hint).toHaveTextContent('0/10000 characters')

    fireEvent.change(input, { target: { value: 'Hello' } })

    expect(hint).toHaveTextContent('5/10000 characters')
  })

  it('should show error message on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    })

    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    const submitButton = screen.getByTestId('chat_button_submit')

    fireEvent.change(input, { target: { value: 'Test task' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByTestId('chat_alert_error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('chat_alert_error')).toHaveTextContent('Please log in to create tasks')
  })

  it('should show success message on successful submission', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ taskId: 'test-123', success: true })
    })

    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    const submitButton = screen.getByTestId('chat_button_submit')

    fireEvent.change(input, { target: { value: 'Test task' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByTestId('chat_alert_success')).toBeInTheDocument()
    })

    expect(screen.getByTestId('chat_alert_success')).toHaveTextContent('Task created successfully')
  })

  it('should handle rate limit error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Too many requests', retryAfter: 30 })
    })

    render(<Chat />)

    const input = screen.getByTestId('chat_input_message')
    const submitButton = screen.getByTestId('chat_button_submit')

    fireEvent.change(input, { target: { value: 'Test task' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByTestId('chat_alert_error')).toBeInTheDocument()
    })

    expect(screen.getByTestId('chat_alert_error')).toHaveTextContent('Rate limit exceeded')
  })
})
