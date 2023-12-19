import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as admin from 'firebase-admin';
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{ bodyParser: false });
  // Initialize Firebase Admin SDK
  // const serviceAccount = require('./auth/firebaseServiceAccount.json');
  // admin.initializeApp({
  //   credential: admin.credential.cert(serviceAccount),
  //   // Add any other configuration options you may need
  // });
  
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
  app.use(require('cors')());

  app.use(bodyParser.json({ limit: '50mb' }));
  await app.listen(3000);

}
bootstrap();