import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="card" role="alert">
          <p className="font-bold">Something broke.</p>
          <p className="text-sm text-gray-600">Stored data may be unavailable. Your records are still on this device.</p>
          <button className="btn-primary mt-3" onClick={() => window.location.reload()}>Reload app</button>
        </div>
      );
    }
    return this.props.children;
  }
}
