export default {
  async fetch(req) {
    const TARGET_HOST = 'ravi.ravikumar.live';
    const url = new URL(req.url);

    // WebSocket handling
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      try {
        const { socket: clientWs, response } = Deno.upgradeWebSocket(req);
        const targetWsUrl = `wss://${TARGET_HOST}${url.pathname}${url.search}`;
        const targetWs = new WebSocket(targetWsUrl);
        const queue = [];

        targetWs.onopen = () => {
          while (queue.length > 0) targetWs.send(queue.shift());
        };

        clientWs.onmessage = (e) => {
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(e.data);
          } else {
            queue.push(e.data);
          }
        };

        targetWs.onmessage = (e) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(e.data);
          }
        };

        const cleanup = () => {
          try { clientWs.close(); } catch {}
          try { targetWs.close(); } catch {}
        };

        targetWs.onclose = cleanup;
        clientWs.onclose = cleanup;

        return response;
      } catch {
        return new Response("WebSocket Error", { status: 500 });
      }
    }

    // Normal HTTP proxy
    try {
      const targetUrl = `https://${TARGET_HOST}${url.pathname}${url.search}`;

      const headers = new Headers();
      const skip = ['host', 'connection', 'upgrade', 'keep-alive', 'proxy-connection'];

      for (const [key, value] of req.headers.entries()) {
        if (!skip.includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }

      headers.set('Host', TARGET_HOST);

      const res = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: !['GET', 'HEAD'].includes(req.method) ? req.body : null,
        redirect: 'manual',
      });

      const resHeaders = new Headers(res.headers);
      resHeaders.delete('content-encoding');
      resHeaders.delete('transfer-encoding');

      return new Response(res.body, {
        status: res.status,
        headers: resHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Proxy Error', details: err.message }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
};
