import { describe, expect, it } from 'vitest';
import {
  ApiNetworkError,
  ApiRequestError,
  getApiErrorPresentation,
} from './apiClient';

describe('typed API error presentation', () => {
  it.each([
    [401, 'authentication'],
    [403, 'authorization'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'validation'],
    [503, 'server'],
  ] as const)('classifies HTTP %s as %s', (status, kind) => {
    const error = new ApiRequestError('Safe backend message', {
      status,
      code: `http_${status}`,
      requestId: 'request-123',
      details: { field: 'amount' },
    });

    const presentation = getApiErrorPresentation(error, 'fallback');
    expect(presentation.kind).toBe(kind);
    expect(presentation.message).toBe('Safe backend message');
    expect(presentation.requestId).toBe('request-123');
    expect(presentation.details).toEqual({ field: 'amount' });
    expect(presentation.retryable).toBe(status >= 500);
  });

  it('marks network failures as retryable without inventing an HTTP status', () => {
    const presentation = getApiErrorPresentation(new ApiNetworkError(), 'fallback');
    expect(presentation.kind).toBe('network');
    expect(presentation.retryable).toBe(true);
  });
});
