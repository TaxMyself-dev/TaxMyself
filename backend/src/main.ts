import 'dotenv/config'
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const bodyParser = require('body-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{ bodyParser: false });
  app.use(require('cors')('*'));
  app.use(bodyParser.json({ limit: '50mb' }));  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(parseInt(process.env.PORT) || 8080);

}
bootstrap();