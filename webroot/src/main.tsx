import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('WordBlitz Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: 'white'
        }}>
          <h2>Oops! Something went wrong.</h2>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              marginTop: '15px',
              backgroundColor: '#4CAF50',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Reload Game
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Performance Monitoring
const reportWebVitals = (metric: any) => {
  // You can send the metric to your analytics service here
  console.log(metric)
}

// Root Element Check
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Failed to find the root element')
}

// Create Root and Render
const root = ReactDOM.createRoot(rootElement)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Report Web Vitals
reportWebVitals(window.performance)

// Enable Hot Module Replacement (HMR)
if (import.meta.hot) {
  import.meta.hot.accept()
} 