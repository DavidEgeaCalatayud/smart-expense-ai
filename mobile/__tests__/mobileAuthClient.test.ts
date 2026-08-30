import { MobileAuthClient, MobileAuthHttpError } from '../src/auth/mobileAuthClient';

const tokenResponse = {
  user: {
    id: '0f5bb66a-0060-4c22-9535-1b680a83169e',
    email: 'mobile@example.com',
    displayName: 'Mobile User',
  },
  tokenType: 'Bearer' as const,
  accessToken: 'access-token',
  expiresIn: 900,
  refreshToken: 'refresh-token',
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('MobileAuthClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the device identity during login', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse(tokenResponse));
    const client = new MobileAuthClient('https://api.example.test');

    const response = await client.login({
      email: 'mobile@example.com',
      password: 'correct-horse-battery-staple',
      deviceId: 'f2681a20-8970-45e4-a9da-b7ded3a38295',
    });

    expect(response).toEqual(tokenResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/v2/auth/mobile/login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'mobile@example.com',
      password: 'correct-horse-battery-staple',
      deviceId: 'f2681a20-8970-45e4-a9da-b7ded3a38295',
    });
  });

  it('uses the bearer access token for the existing web me contract', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse(tokenResponse.user));
    const client = new MobileAuthClient('https://api.example.test');

    const user = await client.me('mobile-access-token');

    expect(user).toEqual(tokenResponse.user);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer mobile-access-token');
  });

  it('surfaces unauthorized refresh responses as typed HTTP errors', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(
        {
          error: {
            message: 'Invalid or expired mobile session',
          },
        },
        401,
      ),
    );
    const client = new MobileAuthClient('https://api.example.test');

    await expect(
      client.refresh('expired-refresh-token-value-that-is-long-enough', 'device-id'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MobileAuthHttpError>>({
        name: 'MobileAuthHttpError',
        status: 401,
        message: 'Invalid or expired mobile session',
      }),
    );
  });
});
