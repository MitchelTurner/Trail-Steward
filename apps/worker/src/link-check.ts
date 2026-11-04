export const LINK_CHECK_UA = 'TrailStewardLinkCheck/1.0';

export type LinkOutcome = {
  linkStatus: 'OK' | 'REDIRECT' | 'BROKEN';
  linkHttpStatus: number | null;
  linkFinalUrl: string | null;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function once(fetchImpl: FetchLike, url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  return fetchImpl(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': LINK_CHECK_UA },
  });
}

export async function checkUrl(url: string, fetchImpl: FetchLike = fetch): Promise<LinkOutcome> {
  let current = url;
  let redirected = false;
  for (let hop = 0; hop <= 5; hop += 1) {
    let response: Response;
    try {
      response = await once(fetchImpl, current, 'HEAD');
      if (response.status === 405 || response.status === 501) {
        response = await once(fetchImpl, current, 'GET');
      }
    } catch {
      return { linkStatus: 'BROKEN', linkHttpStatus: null, linkFinalUrl: current };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || hop === 5) {
        return { linkStatus: 'REDIRECT', linkHttpStatus: response.status, linkFinalUrl: current };
      }
      redirected = true;
      current = new URL(location, current).toString();
      continue;
    }
    if (response.status >= 200 && response.status < 300) {
      return {
        linkStatus: redirected ? 'REDIRECT' : 'OK',
        linkHttpStatus: response.status,
        linkFinalUrl: current,
      };
    }
    return { linkStatus: 'BROKEN', linkHttpStatus: response.status, linkFinalUrl: current };
  }
  return { linkStatus: 'BROKEN', linkHttpStatus: null, linkFinalUrl: current };
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}
