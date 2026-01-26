import 'dotenv/config'
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const bodyParser = require('body-parser');

async function bootstrap() {
  console.log("🔥 NestJS bootstrap started");
  const app = await NestFactory.create(AppModule,{ bodyParser: false });
  app.use(require('cors')('*'));
  
  // Capture raw body for agent authentication (only for /agent routes)
  // This middleware runs only for agent routes to support HMAC signature verification
  app.use((req: any, res: any, next: any) => {
    // Only process agent routes - skip for all other routes
    if (!req.path.startsWith('/agent')) {
      return next(); // Skip raw body capture for non-agent routes
    }
    
    // For GET requests, raw body is empty
    if (req.method === 'GET') {
      req.rawBody = '';
      return next();
    }
    
    // Read the stream and capture raw body for agent routes only
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks as any);
      // Store raw body as string for HMAC verification
      req.rawBody = bodyBuffer.toString('utf8');
      
      // Manually parse JSON if content-type is application/json
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          req.body = JSON.parse(req.rawBody);
        } catch (err) {
          return next(new Error('Invalid JSON in request body'));
        }
      } else {
        req.body = {};
      }
      
      next();
    });
    
    req.on('error', (err: Error) => {
      next(err);
    });
  });
  
  // Only use bodyParser for non-JSON content types (or skip if we already parsed)
  app.use((req: any, res: any, next: any) => {
    // If body was already parsed by our middleware, skip bodyParser
    if (req.body !== undefined) {
      return next();
    }
    // Otherwise use bodyParser
    bodyParser.json({ limit: '50mb' })(req, res, next);
  });  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // -----------------------------
  // 🚀 Fetch SERVER external IP automatically on startup
  // -----------------------------
  const httpService = app.get(HttpService);

  try {
    const { data } = await firstValueFrom(
      httpService.get('https://api.bigdatacloud.net/data/client-info')
    );

    console.log('===========================================');
    console.log('🚀 External IP detected:', data.ipString);
    console.log('===========================================');

  } catch (err) {
    console.error('❌ Failed to fetch external IP:', err.message);
  }

  await app.listen(parseInt(process.env.PORT) || 8080);

}
bootstrap();