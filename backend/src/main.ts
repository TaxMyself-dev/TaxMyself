import 'dotenv/config'
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppDataSource } from './data-source';
import * as admin from 'firebase-admin';

const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');

async function bootstrap() {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  console.log('✅ Migrations applied successfully!');
  const app = await NestFactory.create(AppModule,{ bodyParser: false });
  app.use(
    cookieSession({
      keys: ['badcabab'],
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  app.use(require('cors')('*'));

  app.use(bodyParser.json({ limit: '50mb' }));  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(parseInt(process.env.PORT) || 8080);

}
bootstrap();