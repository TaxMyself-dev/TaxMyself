const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

const PORT = process.env.PORT || 8080;

// Feezback target URLs
// LGS (Link Generation Service) - for /link and /token endpoints
const LGS_TARGET = 'https://lgs-prod.feezback.cloud';
// TPP (Third Party Provider) API - for /tpp/v1/* endpoints
const TPP_TARGET = 'https://prod-tpp.feezback.cloud';

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n🛰️  Incoming: ${req.method} ${req.path}`);
  next();
});

// Proxy configuration with dynamic routing
const feezbackProxy = createProxyMiddleware({
  // Router function: dynamically selects target based on request path
  router: (req) => {
    const path = req.path;
    
    // If path includes /tpp/v1/ or starts with /tpp/, route to TPP API
    if (path.includes('/tpp/v1/') || path.startsWith('/tpp/')) {
      console.log(`📍 Routing to TPP API: ${TPP_TARGET}`);
      return TPP_TARGET;
    }
    
    // Otherwise, route to LGS (for /link and /token endpoints)
    console.log(`📍 Routing to LGS: ${LGS_TARGET}`);
    return LGS_TARGET;
  },
  
  // Path rewrite: remove /proxy/feezback prefix
  pathRewrite: {
    '^/proxy/feezback': '', // Remove /proxy/feezback from path
  },
  
  // Change origin to target host
  changeOrigin: true,
  
  // Logging for proxy requests
  onProxyReq: (proxyReq, req, res) => {
    const target = proxyReq.getHeader('host');
    const method = proxyReq.method;
    const path = proxyReq.path;
    const fullUrl = `https://${target}${path}`;
    
    console.log(`\n📤 Outgoing: ${method} ${fullUrl}`);
    console.log(`📋 Headers:`, JSON.stringify(proxyReq.getHeaders(), null, 2));
    
    // Log request body if present
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
    }
  },
  
  // Logging for proxy responses
  onProxyRes: (proxyRes, req, res) => {
    const status = proxyRes.statusCode;
    console.log(`\n📥 Response: Status ${status}`);
    
    if (status >= 400) {
      console.log(`🔥 Status: ${status}`);
    }
  },
  
  // Error handling
  onError: (err, req, res) => {
    console.error(`\n🔥 PROXY ERROR:`, err.message);
    console.error(`   Path: ${req.path}`);
    console.error(`   Method: ${req.method}`);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy error',
        message: err.message,
      });
    }
  },
});

// Apply proxy to /proxy/feezback/* routes
app.use('/proxy/feezback', feezbackProxy);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Proxy running on port ${PORT}`);
  console.log(`📍 LGS Target: ${LGS_TARGET}`);
  console.log(`📍 TPP Target: ${TPP_TARGET}`);
  console.log(`\n📝 Routes:`);
  console.log(`   - POST /proxy/feezback/link → ${LGS_TARGET}/link`);
  console.log(`   - POST /proxy/feezback/token → ${LGS_TARGET}/token`);
  console.log(`   - POST /proxy/feezback/tpp/v1/* → ${TPP_TARGET}/tpp/v1/*`);
  console.log(`   - GET /health → Health check\n`);
});

