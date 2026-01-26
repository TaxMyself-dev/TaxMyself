import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // For GET requests, raw body is empty string
    if (req.method === 'GET') {
      (req as any).rawBody = '';
      return next();
    }

    // For other methods, capture raw body
    // Note: This middleware must run BEFORE bodyParser.json()
    // Don't set encoding - read as Buffer instead to avoid conflict with bodyParser
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      // Convert Buffer to string
      (req as any).rawBody = Buffer.concat(chunks).toString('utf8');
      next();
    });
    
    req.on('error', (err: Error) => {
      next(err);
    });
  }
}

