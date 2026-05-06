import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';

const port = Number(process.env.BIDI_PORT || 9228);
const appUrl = (process.env.BOEK_APP_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const outputDir = process.env.SCREENSHOT_DIR || '/tmp/boek-ui-audit';
const absServerUrl = process.env.ABS_SERVER_URL?.replace(/\/$/, '');
const absUsername = process.env.ABS_USERNAME;
const absPassword = process.env.ABS_PASSWORD;

let nextId = 1;
let buffer = Buffer.alloc(0);
let handshaken = false;
const pending = new Map();

function makeFrame(text) {
  const payload = Buffer.from(text);
  const header = [0x81];

  if (payload.length < 126) {
    header.push(0x80 | payload.length);
  } else if (payload.length < 65536) {
    header.push(0x80 | 126, payload.length >> 8, payload.length & 255);
  } else {
    throw new Error('Payload too large');
  }

  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4];
  }
  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function readFrame() {
  if (buffer.length < 2) return null;

  const first = buffer[0];
  const second = buffer[1];
  let offset = 2;
  let length = second & 0x7f;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const masked = (second & 0x80) !== 0;
  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + length) return null;
  let payload = buffer.slice(offset, offset + length);
  if (masked) {
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  }
  buffer = buffer.slice(offset + length);
  return { opcode: first & 0x0f, text: payload.toString('utf8') };
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const key = crypto.randomBytes(16).toString('base64');

    socket.on('connect', () => {
      socket.write([
        'GET /session HTTP/1.1',
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Protocol: webdriver-bidi',
        `Origin: http://127.0.0.1:${port}`,
        '',
        '',
      ].join('\r\n'));
    });

    socket.on('error', reject);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshaken) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const status = buffer.slice(0, end).toString();
        if (!status.includes('101 Switching Protocols')) {
          reject(new Error(status));
          return;
        }
        buffer = buffer.slice(end + 4);
        handshaken = true;
        resolve(socket);
      }

      let frame;
      while ((frame = readFrame())) {
        if (frame.opcode !== 1 || !frame.text) continue;
        const message = JSON.parse(frame.text);
        if (message.id && pending.has(message.id)) {
          const { resolve: resolvePending, reject: rejectPending } = pending.get(message.id);
          pending.delete(message.id);
          if (message.type === 'error') rejectPending(new Error(message.error || JSON.stringify(message)));
          else resolvePending(message.result);
        }
      }
    });
  });
}

function send(socket, method, params = {}) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  socket.write(makeFrame(JSON.stringify({ id, method, params })));
  return promise;
}

function resultValue(result) {
  return result?.result?.value ?? result?.value;
}

async function evaluate(socket, context, expression, awaitPromise = false) {
  const result = await send(socket, 'script.evaluate', {
    expression,
    target: { context },
    awaitPromise,
  });
  return resultValue(result);
}

async function waitFor(socket, context, expression, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await evaluate(socket, context, expression);
    if (ready === true) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function loginToAbs() {
  if (!absServerUrl || !absUsername || !absPassword) return null;

  const response = await fetch(`${absServerUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: absUsername, password: absPassword }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    serverUrl: absServerUrl,
    user: {
      id: data.user.id,
      username: data.user.username,
      token: data.user.token,
    },
  };
}

async function capture(socket, context, name, viewport) {
  await send(socket, 'browsingContext.setViewport', {
    context,
    viewport,
    devicePixelRatio: 1,
  });
  await new Promise(resolve => setTimeout(resolve, 400));

  const metricsJson = await evaluate(socket, context, `
    JSON.stringify((() => {
      const visible = Array.from(document.querySelectorAll('body *')).filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });

      const outOfViewport = visible
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        })
        .slice(0, 20)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ''),
          text: (el.textContent || '').trim().slice(0, 80),
          rect: el.getBoundingClientRect().toJSON(),
        }));

      const clippedText = visible
        .filter((el) => {
          if (!el.textContent || !el.textContent.trim()) return false;
          const style = getComputedStyle(el);
          if (style.overflow === 'visible') return false;
          return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
        })
        .slice(0, 20)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ''),
          text: (el.textContent || '').trim().slice(0, 80),
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }));

      return {
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        document: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        outOfViewport,
        clippedText,
        bodyText: document.body.innerText.slice(0, 500),
      };
    })())
  `);

  const screenshot = await send(socket, 'browsingContext.captureScreenshot', {
    context,
    origin: 'viewport',
  });

  const screenshotPath = `${outputDir}/${name}.png`;
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  return {
    name,
    screenshotPath,
    metrics: JSON.parse(metricsJson),
  };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const credentials = await loginToAbs();
  const socket = await connect();
  await send(socket, 'session.new', { capabilities: {} });
  const tree = await send(socket, 'browsingContext.getTree', {});
  const context = tree.contexts[0].context;

  await send(socket, 'browsingContext.navigate', {
    context,
    url: `${appUrl}/#/login`,
    wait: 'complete',
  });

  if (credentials) {
    await evaluate(socket, context, `
      localStorage.setItem('serverUrl', ${JSON.stringify(credentials.serverUrl)});
      localStorage.setItem('token', ${JSON.stringify(credentials.user.token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(credentials.user))});
    `);
  }

  const captures = [];
  captures.push(await capture(socket, context, 'login-mobile', { width: 390, height: 844 }));

  if (credentials) {
    await send(socket, 'browsingContext.navigate', {
      context,
      url: `${appUrl}/#/`,
      wait: 'complete',
    });
    await waitFor(
      socket,
      context,
      `(() => {
        const text = document.body.innerText || '';
        return !text.includes('Loading') && (text.includes('Library') || text.includes('No items'));
      })()`,
      'library page'
    );

    captures.push(await capture(socket, context, 'library-desktop', { width: 1440, height: 900 }));
    captures.push(await capture(socket, context, 'library-mobile', { width: 390, height: 844 }));

    await evaluate(socket, context, `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const podcastButton = buttons.find(button => /podcast/i.test(button.textContent || ''));
        if (podcastButton) podcastButton.click();
      })()
    `);
    await waitFor(
      socket,
      context,
      `(() => {
        const text = document.body.innerText || '';
        return !text.includes('Loading') && (text.includes('Continue') || text.includes('Newest') || text.includes('podcast'));
      })()`,
      'podcast page'
    );
    captures.push(await capture(socket, context, 'podcasts-desktop', { width: 1440, height: 900 }));

    await send(socket, 'browsingContext.navigate', {
      context,
      url: `${appUrl}/#/stats`,
      wait: 'complete',
    });
    await waitFor(
      socket,
      context,
      `(() => {
        const text = document.body.innerText || '';
        return !text.includes('Loading stats') && (text.includes('Total Listening') || text.includes('Failed to load'));
      })()`,
      'stats page'
    );
    captures.push(await capture(socket, context, 'stats-desktop', { width: 1440, height: 900 }));
  }

  const reportPath = `${outputDir}/report.json`;
  await fs.writeFile(reportPath, JSON.stringify({ captures }, null, 2));
  console.log(JSON.stringify({ outputDir, reportPath, captures: captures.map(({ name, screenshotPath, metrics }) => ({
    name,
    screenshotPath,
    horizontalOverflow: metrics.horizontalOverflow,
    outOfViewportCount: metrics.outOfViewport.length,
    clippedTextCount: metrics.clippedText.length,
  })) }, null, 2));

  socket.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
