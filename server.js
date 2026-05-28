const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = process.env.PORT || 8080;
const TARGET_HOST = 'kards.live.1939api.com';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

if (proxyAgent) {
  console.log(`Using proxy: ${proxyUrl}`);
} else {
  console.log('No system proxy detected, connecting directly');
}

app.use(cors());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.use('/api', (req, res) => {
  const targetPath = req.path.replace(/^\/api/, '') || '/';
  const searchStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const targetUrl = `https://${TARGET_HOST}${targetPath}${searchStr}`;

  console.log(`Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`);

  const parsedUrl = new URL(targetUrl);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      'host': TARGET_HOST
    },
    rejectUnauthorized: false,
    timeout: 30000
  };

  if (proxyAgent) {
    options.agent = proxyAgent;
  }

  const proxyReq = https.request(options, (proxyRes) => {
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-headers'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway', message: err.message });
    }
  });

  proxyReq.on('timeout', () => {
    console.error(`Proxy timeout for ${req.method} ${req.originalUrl}`);
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway Timeout', message: '上游服务器超时' });
    }
  });

  if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
    proxyReq.write(req.body);
  }

  proxyReq.end();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`KARDS Deck Updater proxy server running at http://127.0.0.1:${PORT}`);
  console.log(`Serving static files from ${path.join(__dirname, 'public')}`);
  console.log(`Proxying /api/* to https://${TARGET_HOST}`);
});