import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module'; // תוודא שהמסלול מתאים לפרויקט שלך
import { Response } from 'supertest'; // מייבאים את הטיפוס המתאים
//import { describe, it } from 'node:test';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], // מייבא את כל המודולים של האפליקציה שלך
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close(); // סוגר את האפליקציה לאחר סיום הבדיקות
  });

  it('should register a user successfully', async () => {
    const user = {
      personal: {
        firebaseId: 'someFirebaseId',
        firstName: 'John',
        lastName: 'Doe',
        email: 'johndoe@example.com',
      },
      spouse: {
        firstName: 'Jane',
        lastName: 'Doe',
      },
      children: {
        children: [],
      },
      business: {
        companyName: 'Doe Enterprises',
      },
      validation: {},
    };

    const response: Response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send(user)
      .expect(201);

    console.log(response.body);
    expect(response.body.personal).toMatchObject(user.personal);
  });
});
