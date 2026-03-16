import '@testing-library/jest-dom';

// JSDOM does not provide fetch; auth and other code may call it. Mock to avoid "fetch is not defined" and related warnings.
if (typeof globalThis.fetch === 'undefined') {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  });
}

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

// Fail tests on console.error and console.warn so that regressions (e.g. act() warnings, Radix a11y) are not ignored.
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args: unknown[]) => {
  originalError.apply(console, args);
  throw new Error(`console.error was called (tests must not emit errors): ${args.map(String).join(' ')}`);
};
console.warn = (...args: unknown[]) => {
  originalWarn.apply(console, args);
  throw new Error(`console.warn was called (tests must not emit warnings): ${args.map(String).join(' ')}`);
};

