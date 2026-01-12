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

  it('should render chat page with title', () => {
    render(<Chat />)

    expect(screen.getByText('Neuen Task erstellen')).toBeInTheDocument()
  })

  it('should render navigation links', () => {
    render(<Chat />)

    expect(screen.getByText('Universal AI Agent')).toBeInTheDocument()
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('should render form with textarea and submit button', () => {
    render(<Chat />)

    expect(screen.getByPlaceholderText(/Beschreibe deine Aufgabe/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vorschau & Bestaetigen/i })).toBeInTheDocument()
  })

  it('should have submit button disabled when message is empty', () => {
    render(<Chat />)

    const submitButton = screen.getByRole('button', { name: /Vorschau & Bestaetigen/i })
    expect(submitButton).toBeDisabled()
  })

  it('should enable submit button when message is entered', () => {
    render(<Chat />)

    const textarea = screen.getByPlaceholderText(/Beschreibe deine Aufgabe/i)
    const submitButton = screen.getByRole('button', { name: /Vorschau & Bestaetigen/i })

    fireEvent.change(textarea, { target: { value: 'Erstelle eine React Komponente' } })

    expect(submitButton).not.toBeDisabled()
  })

  it('should show confirmation dialog after submitting', async () => {
    render(<Chat />)

    const textarea = screen.getByPlaceholderText(/Beschreibe deine Aufgabe/i)
    const submitButton = screen.getByRole('button', { name: /Vorschau & Bestaetigen/i })

    fireEvent.change(textarea, { target: { value: 'Erstelle eine React Komponente' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Task bestaetigen')).toBeInTheDocument()
    })
  })

  it('should render file upload area', () => {
    render(<Chat />)

    expect(screen.getByText(/Dateien anhaengen/i)).toBeInTheDocument()
    expect(screen.getByText(/durchsuchen/i)).toBeInTheDocument()
  })

  it('should render additional notes textarea', () => {
    render(<Chat />)

    expect(screen.getByText(/Zusaetzliche Hinweise/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Technologie-Praeferenzen/i)).toBeInTheDocument()
  })
})
