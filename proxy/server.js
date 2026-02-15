const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 8080;

// ===========================
// Proxy Mode: "test" | "feezback-dev" | "feezback-prod"
// ===========================
const MODE = process.env.PROXY_MODE || "test";

// ===========================
// Base URLs
// ===========================
const FEEZBACK_DEV_LGS_URL = "https://lgs-prod.feezback.cloud";
const FEEZBACK_PROD_LGS_URL = "https://lgs-prod.feezback.cloud";
const FEEZBACK_DEV_TPP_URL = "https://prod-tpp.feezback.cloud";
const FEEZBACK_PROD_TPP_URL = "https://prod-tpp.feezback.cloud";
const TEST_URL = "https://webhook.site/85a80efc-8c70-4753-ab94-c6d3237c5cd4";

// ===========================
// Select Targets
// ===========================
let LGS_TARGET, TPP_TARGET;
if (MODE === "feezback-dev") {
  LGS_TARGET = FEEZBACK_DEV_LGS_URL;
  TPP_TARGET = FEEZBACK_DEV_TPP_URL;
} else if (MODE === "feezback-prod") {
  LGS_TARGET = FEEZBACK_PROD_LGS_URL;
  TPP_TARGET = FEEZBACK_PROD_TPP_URL;
} else {
  LGS_TARGET = TEST_URL;
  TPP_TARGET = TEST_URL;
}

// ===========================
// Body parsing middleware
// ===========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===========================
// Log incoming requests
// ===========================
app.use((req, res, next) => {
  console.log("🛰️ Incoming:", req.method, req.url);
  next();
});

// ===========================
// /myip → verify outbound NAT IP
// ===========================
app.get("/myip", async (req, res) => {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const ip = await r.json();
    res.send(ip);
  } catch (err) {
    res.status(500).send({ error: "Failed to check IP", details: err.message });
  }
});

// ===========================
// Proxy
// ===========================
app.use(
  "/proxy/feezback",
  createProxyMiddleware({
    target: LGS_TARGET, // Default target (will be overridden by router)
    changeOrigin: true,
    xfwd: false, // DO NOT forward real client IP
    pathRewrite: { "^/proxy/feezback": "" },

    selfHandleResponse: false,
    logLevel: "debug",

    // Router function - מפנה ל-target שונה לפי path
    router: (req) => {
      const path = req.path || req.url || req.originalUrl;
      const cleanPath = path.replace("/proxy/feezback", "");
      
      // אם זה TPP API (/tpp/v1/...), פנה ל-TPP domain
      if (cleanPath.includes('/tpp/v1/') || cleanPath.startsWith('/tpp/')) {
        console.log(`🔄 Routing to TPP API: ${TPP_TARGET}`);
        return TPP_TARGET;
      }
      
      // אחרת, פנה ל-LGS domain (token, link)
      console.log(`🔄 Routing to LGS: ${LGS_TARGET}`);
      return LGS_TARGET;
    },

    proxyReqOptDecorator: (opts, req) => {
      // Ensure Authorization header is forwarded for TPP requests
      const path = req.path || req.url || req.originalUrl || "";
      const cleanPath = path.replace("/proxy/feezback", "");
      const isTPP = cleanPath.includes('/tpp/v1/') || cleanPath.startsWith('/tpp/');
      
      if (isTPP) {
        // For TPP requests, send ONLY Authorization header (clean request)
        // Save the Authorization header first
        let authHeader = null;
        if (req.headers.authorization) {
          authHeader = req.headers.authorization.trim();
          if (!authHeader.startsWith('Bearer ')) {
            authHeader = `Bearer ${authHeader}`;
          }
        }
        
        // Remove ALL headers except essential ones
        const essentialHeaders = ['host', 'connection'];
        const headersToKeep = {};
        
        // Keep only essential headers
        for (const key of essentialHeaders) {
          if (opts.headers[key]) {
            headersToKeep[key] = opts.headers[key];
          }
        }
        
        // Keep content headers if body exists
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          if (opts.headers['content-type']) {
            headersToKeep['content-type'] = opts.headers['content-type'];
          }
          if (opts.headers['content-length']) {
            headersToKeep['content-length'] = opts.headers['content-length'];
          }
        }
        
        // Clear all headers and set only the ones we want
        opts.headers = headersToKeep;
        
        // Add Authorization header if exists
        if (authHeader) {
          opts.headers["Authorization"] = authHeader;
          console.log("🔑 Clean request - Only Authorization header (length:", authHeader.length + ")");
          console.log("   Removed all other headers for TPP request");
        } else {
          console.log("⚠️ WARNING: TPP request but no Authorization header found!");
        }
      } else {
        // For non-TPP requests, remove only IP-related headers
        delete opts.headers["x-forwarded-for"];
        delete opts.headers["x-forwarded-host"];
        delete opts.headers["x-forwarded-proto"];
        delete opts.headers["x-real-ip"];
        delete opts.headers["cf-connecting-ip"];
      }

      return opts;
    },

    on: {
      proxyReq: (proxyReq, req, res) => {
        // Get the target from router
        const path = req.path || req.url || req.originalUrl;
        const cleanPath = path.replace("/proxy/feezback", "");
        const target = cleanPath.includes('/tpp/v1/') || cleanPath.startsWith('/tpp/') 
          ? TPP_TARGET 
          : LGS_TARGET;
        
        // Check if this is the accounts endpoint - needs empty body
        const isAccountsEndpoint = cleanPath.includes('/tpp/v1/users/') && cleanPath.endsWith('/accounts');
        
        // Build the full target URL
        const targetUrl = `${target}${cleanPath}`;
        
        // Log incoming Authorization header for debugging
        console.log("🔍 INCOMING Authorization from client:", req.headers.authorization ? req.headers.authorization.substring(0, 30) + "..." : "(missing)");
        
        // Ensure Authorization header is set for TPP requests (backup in case proxyReqOptDecorator didn't work)
        if (target === TPP_TARGET && req.headers.authorization) {
          // Remove any existing Authorization headers first (both cases)
          proxyReq.removeHeader("Authorization");
          proxyReq.removeHeader("authorization");
          proxyReq.removeHeader("AUTHORIZATION");
          
          let authHeader = req.headers.authorization;
          
          // Ensure the token is in the correct format: "Bearer TOKEN"
          // Remove any extra whitespace
          authHeader = authHeader.trim();
          if (!authHeader.startsWith('Bearer ')) {
            authHeader = `Bearer ${authHeader}`;
          }
          
          // Set it on proxyReq as well to ensure it's sent
          // Use exact case "Authorization" (capital A, rest lowercase)
          proxyReq.setHeader("Authorization", authHeader);
          
          // Verify it was set correctly
          const setHeader = proxyReq.getHeader("Authorization");
          console.log("🔑 Authorization header set on proxyReq (backup)");
          console.log("   Length:", setHeader ? setHeader.length : 0);
          console.log("   First 50 chars:", setHeader ? setHeader.substring(0, 50) : "NOT SET");
        }
        
        // Get request body if available (but skip for accounts endpoint)
        let bodyStr = '';
        if (!isAccountsEndpoint) {
          // For non-accounts endpoints, forward body as usual
          if (req.body && Object.keys(req.body).length > 0) {
            bodyStr = JSON.stringify(req.body, null, 2);
            // Write body to proxy request
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader("Content-Type", "application/json");
            proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          } else if (typeof req.body === 'string' && req.body.length > 0) {
            bodyStr = req.body;
            proxyReq.setHeader("Content-Length", Buffer.byteLength(req.body));
            proxyReq.write(req.body);
          }
        } else {
          // For accounts endpoint, ensure body is empty
          // Remove Content-Type and Content-Length headers if they exist
          proxyReq.removeHeader("Content-Type");
          proxyReq.removeHeader("Content-Length");
          bodyStr = '(empty - accounts endpoint)';
        }
        
        // Get headers for logging
        const headers = { ...proxyReq.getHeaders() };
        // Note: Authorization header is shown in logs for debugging
        // If you want to hide it, uncomment the next lines:
        // if (headers.authorization) {
        //   headers.authorization = '[REDACTED]';
        // }
        
        console.log("🔥 PROXY REQ FIRED");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📤 OUTGOING REQUEST TO TARGET:");
        console.log("   Method:", req.method);
        console.log("   URL:", targetUrl);
        if (isAccountsEndpoint) {
          console.log("   ⚠️ Accounts endpoint - body forced to empty");
        }
        // Log Authorization header separately for debugging
        const authHeader = proxyReq.getHeader("Authorization");
        const authHeaderLower = proxyReq.getHeader("authorization");
        if (authHeader) {
          console.log("   🔑 Authorization (exact):", authHeader.substring(0, 50) + "..." + " (length: " + authHeader.length + ")");
          // Check if there are any special characters or issues
          if (authHeader.includes('\n') || authHeader.includes('\r')) {
            console.log("   ⚠️ WARNING: Authorization header contains newline characters!");
          }
          if (authHeader !== authHeader.trim()) {
            console.log("   ⚠️ WARNING: Authorization header has leading/trailing whitespace!");
          }
        } else if (authHeaderLower) {
          console.log("   🔑 Authorization (lowercase):", authHeaderLower.substring(0, 50) + "..." + " (length: " + authHeaderLower.length + ")");
          console.log("   ⚠️ WARNING: Authorization header is lowercase, not 'Authorization'!");
        } else {
          console.log("   🔑 Authorization: (missing)");
        }
        console.log("   Headers:", JSON.stringify(headers, null, 2));
        if (bodyStr && !isAccountsEndpoint) {
          console.log("   Body:", bodyStr);
        } else {
          console.log("   Body: (empty)");
        }
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Print curl command for debugging
        console.log("📋 CURL COMMAND:");
        let curlCmd = `curl --location --request ${req.method} '${targetUrl}'`;
        
        // Add headers
        const allHeaders = proxyReq.getHeaders();
        for (const [key, value] of Object.entries(allHeaders)) {
          // Skip some headers that curl adds automatically
          if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'connection' && key.toLowerCase() !== 'content-length') {
            curlCmd += ` \\\n  --header '${key}: ${value}'`;
          }
        }
        
        // Add body if exists
        if (bodyStr && !isAccountsEndpoint && bodyStr !== '(empty - accounts endpoint)') {
          // Escape single quotes in body for curl
          const escapedBody = bodyStr.replace(/'/g, "'\\''");
          curlCmd += ` \\\n  --data '${escapedBody}'`;
        }
        
        console.log(curlCmd);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      },

      proxyRes: (proxyRes, req, res) => {
        console.log("🔥 PROXY RES FIRED");
        console.log("📦 Status:", proxyRes.statusCode);
      },

      error: (err, req, res) => {
        console.error("🔥 PROXY ERROR:", err.message);
        console.error("   Stack:", err.stack);
      }
    }
  })
);

// ===========================
// Start Server + Print NAT IP
// ===========================
app.listen(PORT, async () => {
  console.log("🚀 Proxy running on port", PORT);
  console.log(`🔧 Mode: ${MODE}`);
  console.log(`➡️ LGS Target: ${LGS_TARGET}`);
  console.log(`➡️ TPP Target: ${TPP_TARGET}`);

  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const ip = await r.json();
    console.log(`🌐 Server outbound IP: ${ip.ip}`);
  } catch (err) {
    console.log("⚠️ Could not determine outbound IP:", err.message);
  }
});



// const express = require("express");
// const { createProxyMiddleware } = require("http-proxy-middleware");

// const app = express();
// const PORT = process.env.PORT || 8080;

// // ===========================
// // Proxy Mode: "test" | "feezback-dev" | "feezback-prod"
// // ===========================
// const MODE = process.env.PROXY_MODE || "test";

// // ===========================
// // Base URLs
// // ===========================
// const FEEZBACK_DEV_LGS_URL = "https://lgs-prod.feezback.cloud";
// const FEEZBACK_PROD_LGS_URL = "https://lgs-prod.feezback.cloud";
// const FEEZBACK_DEV_TPP_URL = "https://prod-tpp.feezback.cloud";
// const FEEZBACK_PROD_TPP_URL = "https://prod-tpp.feezback.cloud";
// const TEST_URL = "https://webhook.site/85a80efc-8c70-4753-ab94-c6d3237c5cd4";

// // ===========================
// // Select Targets
// // ===========================
// let LGS_TARGET, TPP_TARGET;
// if (MODE === "feezback-dev") {
//   LGS_TARGET = FEEZBACK_DEV_LGS_URL;
//   TPP_TARGET = FEEZBACK_DEV_TPP_URL;
// } else if (MODE === "feezback-prod") {
//   LGS_TARGET = FEEZBACK_PROD_LGS_URL;
//   TPP_TARGET = FEEZBACK_PROD_TPP_URL;
// } else {
//   LGS_TARGET = TEST_URL;
//   TPP_TARGET = TEST_URL;
// }

// // ===========================
// // Body parsing middleware
// // ===========================
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // ===========================
// // Debug: incoming Authorization header
// // ===========================
// app.use((req, res, next) => {
//   console.log("🔑 INCOMING Authorization:");
//   console.log(req.headers.authorization || "(missing)");
//   next();
// });

// // ===========================
// // Log incoming requests
// // ===========================
// app.use((req, res, next) => {
//   console.log("🛰️ Incoming:", req.method, req.url);
//   console.log("🔑 OUTGOING Authorization:");
//   console.log(req.headers.authorization || "(missing)");
//   next();
// });

// // ===========================
// // /myip → verify outbound NAT IP
// // ===========================
// app.get("/myip", async (req, res) => {
//   try {
//     const r = await fetch("https://api.ipify.org?format=json");
//     const ip = await r.json();
//     res.send(ip);
//   } catch (err) {
//     res.status(500).send({ error: "Failed to check IP", details: err.message });
//   }
// });

// // ===========================
// // Proxy
// // ===========================
// app.use(
//   "/proxy/feezback",
//   createProxyMiddleware({
//     target: LGS_TARGET, // Default target (will be overridden by router)
//     changeOrigin: true,
//     xfwd: false, // DO NOT forward real client IP
//     pathRewrite: { "^/proxy/feezback": "" },

//     selfHandleResponse: false,
//     logLevel: "debug",

//     // Router function - מפנה ל-target שונה לפי path
//     router: (req) => {
//       const path = req.path || req.url || req.originalUrl;
//       const cleanPath = path.replace("/proxy/feezback", "");
      
//       // אם זה TPP API (/tpp/v1/...), פנה ל-TPP domain
//       if (cleanPath.includes('/tpp/v1/') || cleanPath.startsWith('/tpp/')) {
//         console.log(`🔄 Routing to TPP API: ${TPP_TARGET}`);
//         return TPP_TARGET;
//       }
      
//       // אחרת, פנה ל-LGS domain (token, link)
//       console.log(`🔄 Routing to LGS: ${LGS_TARGET}`);
//       return LGS_TARGET;
//     },

//     proxyReqOptDecorator: (opts, req) => {
//       // Remove real client IP headers
//       delete opts.headers["x-forwarded-for"];
//       delete opts.headers["x-forwarded-host"];
//       delete opts.headers["x-forwarded-proto"];
//       delete opts.headers["x-real-ip"];
//       delete opts.headers["cf-connecting-ip"];

//       // Optional: force your static Cloud NAT IP
//       // opts.headers["X-Forwarded-For"] = "YOUR_STATIC_IP";

//       return opts;
//     },

//     on: {

//       proxyReq: (proxyReq, req) => {
//         const originalPath = req.originalUrl || req.url || "";
      
//         const isTPP =
//           originalPath.includes("/tpp/v1/") ||
//           originalPath.startsWith("/tpp/");
      
//         const target = isTPP ? TPP_TARGET : LGS_TARGET;
//         const cleanPath = originalPath.replace("/proxy/feezback", "");
//         const targetUrl = `${target}${cleanPath}`;
      
//         // ===========================
//         // AUTH routing
//         // ===========================
//         if (isTPP && req.headers.authorization) {
//           proxyReq.setHeader("authorization", req.headers.authorization);
//         } else {
//           proxyReq.removeHeader("authorization");
//         }
      
//         // ===========================
//         // ✅ BODY FIX (THIS IS THE KEY)
//         // ===========================
//         fixRequestBody(proxyReq, req);
      
//         // ===========================
//         // SAFE DEBUG
//         // ===========================
//         console.log("🔥 PROXY REQ FIRED");
//         console.log("📤 METHOD:", req.method);
//         console.log("📤 URL:", targetUrl);
//         console.log(
//           "📤 AUTH:",
//           proxyReq.getHeader("authorization") ? "Bearer ***" : "(none)"
//         );
//         console.log("📤 BODY LENGTH:", req.body ? JSON.stringify(req.body).length : 0);
//       },
      
//       // proxyReq: (proxyReq, req, res) => {
//       //   // Get the target from router
//       //   const path = req.path || req.url || req.originalUrl;
//       //   const cleanPath = path.replace("/proxy/feezback", "");
//       //   const target = cleanPath.includes('/tpp/v1/') || cleanPath.startsWith('/tpp/') 
//       //     ? TPP_TARGET 
//       //     : LGS_TARGET;
        
//       //   // Build the full target URL
//       //   const targetUrl = `${target}${cleanPath}`;
        
//       //   // Get request body if available
//       //   let bodyStr = '';
//       //   // if (req.body && Object.keys(req.body).length > 0) {
//       //   //   bodyStr = JSON.stringify(req.body, null, 2);
//       //   //   // Write body to proxy request
//       //   //   const bodyData = JSON.stringify(req.body);
//       //   //   proxyReq.setHeader("Content-Type", "application/json");
//       //   //   proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
//       //   //   proxyReq.write(bodyData);
//       //   // } else if (typeof req.body === 'string' && req.body.length > 0) {
//       //   //   bodyStr = req.body;
//       //   //   proxyReq.setHeader("Content-Length", Buffer.byteLength(req.body));
//       //   //   proxyReq.write(req.body);
//       //   // }
        
//       //   // Get headers (sanitize sensitive data if needed)
//       //   // const headers = { ...proxyReq.getHeaders() };
//       //   // Optionally remove or mask sensitive headers
//       //   // if (headers.authorization) {
//       //   //   headers.authorization = '[REDACTED]';
//       //   // }

//       //   if (req.headers.authorization) {
//       //     proxyReq.setHeader("authorization", req.headers.authorization);
//       //   }

//       //   console.log("🔍 REAL outgoing Authorization:");
//       //   console.log(req.headers.authorization);
        
//       //   console.log("🔥 PROXY REQ FIRED");
//       //   console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//       //   console.log("📤 OUTGOING REQUEST TO TARGET:");
//       //   console.log("   Method:", req.method);
//       //   console.log("   URL:", targetUrl);
//       //   console.log("   Headers:", JSON.stringify(headers, null, 2));
//       //   if (bodyStr) {
//       //     console.log("   Body:", bodyStr);
//       //   } else {
//       //     console.log("   Body: (empty)");
//       //   }
//       //   console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//       // },

//       proxyRes: (proxyRes, req, res) => {
//         console.log("🔥 PROXY RES FIRED");
//         console.log("📦 Status:", proxyRes.statusCode);
//       },

//       error: (err, req, res) => {
//         console.error("🔥 PROXY ERROR:", err.message);
//         console.error("   Stack:", err.stack);
//       }
//     }
//   })
// );

// // ===========================
// // Start Server + Print NAT IP
// // ===========================
// app.listen(PORT, async () => {
//   console.log("🚀 Proxy running on port", PORT);
//   console.log(`🔧 Mode: ${MODE}`);
//   console.log(`➡️ LGS Target: ${LGS_TARGET}`);
//   console.log(`➡️ TPP Target: ${TPP_TARGET}`);

//   try {
//     const r = await fetch("https://api.ipify.org?format=json");
//     const ip = await r.json();
//     console.log(`🌐 Server outbound IP: ${ip.ip}`);
//   } catch (err) {
//     console.log("⚠️ Could not determine outbound IP:", err.message);
//   }
// });