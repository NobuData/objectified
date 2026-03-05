import { render, screen } from '@testing-library/react';
import React from 'react';

// Basic smoke test to verify the testing setup works
describe('Testing setup', () => {
  it('should render a simple component', () => {
    const TestComponent = () => <div>Hello Objectified</div>;
    render(<TestComponent />);
    expect(screen.getByText('Hello Objectified')).toBeInTheDocument();
  });
});

