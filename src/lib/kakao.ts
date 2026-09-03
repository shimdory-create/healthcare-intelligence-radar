import { getAppSetting, setAppSetting } from './db';

const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const MEMO_SEND_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const REFRESH_TOKEN_KEY = 'kakao_refresh_token';

interface KakaoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** exchanges an OAuth authorization code for tokens and stores the refresh token (one-time bootstrap) */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<void> {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) throw new Error('KAKAO_REST_API_KEY is not set');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Kakao token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as KakaoTokenResponse;
  if (!data.refresh_token) throw new Error('Kakao did not return a refresh_token');
  await setAppSetting(REFRESH_TOKEN_KEY, data.refresh_token);
}

/** refreshes and returns a usable access token, rotating the stored refresh token if Kakao issues a new one */
async function getValidAccessToken(): Promise<string> {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) throw new Error('KAKAO_REST_API_KEY is not set');

  const refreshToken = await getAppSetting(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('no Kakao refresh token stored; complete the one-time authorization first');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: restApiKey,
    refresh_token: refreshToken,
  });
  if (process.env.KAKAO_CLIENT_SECRET) body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Kakao token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as KakaoTokenResponse;
  if (data.refresh_token) await setAppSetting(REFRESH_TOKEN_KEY, data.refresh_token);
  return data.access_token;
}

/** sends a "메모 보내기" (send-to-me) KakaoTalk message with a link back to the dashboard */
export async function sendKakaoMemo(text: string, linkUrl: string): Promise<void> {
  const accessToken = await getValidAccessToken();

  const templateObject = {
    object_type: 'text',
    text,
    link: { web_url: linkUrl, mobile_web_url: linkUrl },
    button_title: '대시보드 보기',
  };

  const res = await fetch(MEMO_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  if (!res.ok) {
    throw new Error(`Kakao memo send failed: ${res.status} ${await res.text()}`);
  }
}
