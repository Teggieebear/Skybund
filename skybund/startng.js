const START_NG_ORIGIN = 'https://start.ng';
const CONNECT_URL = `${START_NG_ORIGIN}/connect`;

let framePromise;

function getConnectFrame() {
  if (!framePromise) {
    framePromise = new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.src = CONNECT_URL;
      frame.hidden = true;
      frame.title = 'Start.ng connection';
      frame.onload = () => resolve(frame);
      frame.onerror = () => {
        framePromise = undefined;
        reject(new Error('Start.ng connect frame did not load'));
      };
      document.body.append(frame);
    });
  }
  return framePromise;
}

export async function askStartNg(message, replyType, timeoutMs = 5000) {
  let frame;
  try {
    frame = await getConnectFrame();
  } catch {
    return null;
  }

  if (!frame.contentWindow) return null;

  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const finish = (reply) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(reply);
    };

    const onMessage = (event) => {
      if (
        event.origin !== START_NG_ORIGIN ||
        event.source !== frame.contentWindow ||
        event.data?.type !== replyType ||
        event.data?.requestId !== requestId
      ) {
        return;
      }
      finish(event.data);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', onMessage);
    frame.contentWindow.postMessage({ ...message, requestId }, START_NG_ORIGIN);
  });
}

export function signInWithStartNg() {
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  window.location.href = `${START_NG_ORIGIN}/?return_to=${encodeURIComponent(returnTo)}`;
}

export function observeStartNgPlayer(onPlayer, onUnavailable) {
  let disposed = false;
  let requestInFlight = false;

  const refresh = async () => {
    if (disposed || requestInFlight || document.visibilityState === 'hidden') return;
    requestInFlight = true;
    try {
      const reply = await askStartNg({ type: 'startng:whoami' }, 'startng:user');
      if (disposed) return;
      if (!reply) {
        onUnavailable?.();
        return;
      }

      const player = reply.user ?? reply.guest ?? null;
      onPlayer(player, Boolean(reply.user));
    } finally {
      requestInFlight = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };

  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', onVisible);
  void refresh();

  return () => {
    disposed = true;
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function saveStartNgScore(score, gems) {
  return askStartNg(
    { type: 'startng:score', stats: { score, gems } },
    'startng:scoreSaved',
  );
}

export function getStartNgLeaderboard(limit = 10) {
  return askStartNg(
    { type: 'startng:leaderboard', limit },
    'startng:leaderboardData',
  );
}
