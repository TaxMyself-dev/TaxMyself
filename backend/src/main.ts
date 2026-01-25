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
  app.use(bodyParser.json({ limit: '50mb' }));  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // // -----------------------------
  // // 🚀 Fetch SERVER external IP automatically on startup
  // // -----------------------------
  // const httpService = app.get(HttpService);

  // try {
  //   const { data } = await firstValueFrom(
  //     httpService.get('https://api.bigdatacloud.net/data/client-info')
  //   );

  //   console.log('===========================================');
  //   console.log('🚀 External IP detected:', data.ipString);
  //   console.log('===========================================');

  // } catch (err) {
  //   console.error('❌ Failed to fetch external IP:', err.message);
  // }

  await app.listen(parseInt(process.env.PORT) || 8080);

}
bootstrap();