/**
 * Unit tests for canvasStyleUtils — shared UI-layer canvas style helpers.
 * Reference: GitHub #94 — Add canvas settings form
 */

// Mock @xyflow/react so the test environment (which lacks a full React DOM)
// can resolve the import. BackgroundVariant is a plain string enum.
jest.mock('@xyflow/react', () => ({
  BackgroundVariant: {
    Dots: 'dots',
    Lines: 'lines',
    Cross: 'cross',
  },
}));

import { gridStyleToBackgroundVariant } from '@/app/dashboard/utils/canvasStyleUtils';

describe('gridStyleToBackgroundVariant', () => {
  it('maps dots to BackgroundVariant.Dots', () => {
    expect(gridStyleToBackgroundVariant('dots')).toBe('dots');
  });

  it('maps lines to BackgroundVariant.Lines', () => {
    expect(gridStyleToBackgroundVariant('lines')).toBe('lines');
  });

  it('maps cross to BackgroundVariant.Cross', () => {
    expect(gridStyleToBackgroundVariant('cross')).toBe('cross');
  });
});
