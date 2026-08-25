import { Component, type ErrorInfo, type ReactNode } from 'react'

export class SectionBoundary extends Component<
  { children: ReactNode; sectionId: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('section_render_failed', {
      section_id: this.props.sectionId,
      error,
      component_stack: info.componentStack,
    })
  }

  render() {
    if (this.state.failed) {
      return <div role="alert">This section is temporarily unavailable.</div>
    }
    return this.props.children
  }
}
