import '@testing-library/jest-dom';

// ResizeObserver is used by @radix-ui/react-scroll-area (e.g. ClassDialog). JSDOM does not provide it.
class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
Object.defineProperty(global, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// Shared mock for window.matchMedia — required by next-themes and any component
// that reads media queries in a jsdom test environment.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

