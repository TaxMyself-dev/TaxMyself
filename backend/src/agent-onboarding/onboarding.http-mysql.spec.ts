import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import {
  Delegation,
  DelegationScope,
  DelegationStatus,
} from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../enum';
import { AgentDomainService } from '../agent-harness/agent-domain.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingExtractor } from './onboarding.extractor';

// Only Firebase token verification and the synthetic account directory are fixtures.
// The controller, real FirebaseAuthGuard, DTO validation, model extraction (one
// explicit smoke case), transactions, HTTP serialization and MySQL are real.
jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: async (token: string) => {
      if (!/^onboarding-qa-[a-f0-9-]+-(http|bob|live|seed|alice)$/.test(token))
        throw new Error('invalid test token');
      return { uid: token, firebase: { sign_in_second_factor: 'test' } };
    },
  }),
}));
const {
  developmentOptions,
  assertDevelopmentDatabase,
  cleanupOwners,
} = require('../../scripts/onboarding-test-target.cjs');
const suite =
  process.env.ONBOARDING_APPROVED_DATABASE === 'keepintax-dev'
    ? describe
    : describe.skip;
suite('onboarding HTTP and approved development MySQL', () => {
  let db: DataSource;
  let app: INestApplication;
  let service: OnboardingService;
  let extraction: any;
  let live = false;
  const runId = randomUUID();
  const owners = ['http', 'bob', 'live'].map(
    (name) => `onboarding-qa-${runId}-${name}`,
  );
  const businesses = [
    { businessNumber: '771111', businessName: 'עסק בדיקה ראשון' },
    { businessNumber: '772222', businessName: 'עסק בדיקה שני' },
  ];
  let snapshot: any;
  let proposal: any;
  beforeAll(async () => {
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    db = new DataSource({
      type: 'mysql',
      ...developmentOptions(),
      synchronize: false,
      timezone: 'Z',
    });
    await db.initialize();
    await assertDevelopmentDatabase(db);
    const realExtractor = new OnboardingExtractor();
    const module = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        FirebaseAuthGuard,
        OnboardingService,
        { provide: DataSource, useValue: db },
        {
          provide: OnboardingExtractor,
          useValue: {
            extract: async (message, context) => {
              if (!live) return extraction;
              const output = await realExtractor.extract(message, context);
              const folder = join(
                __dirname,
                '../../../.test-tmp/onboarding-dev',
              );
              mkdirSync(folder, { recursive: true });
              writeFileSync(
                join(folder, 'synthetic-model-output.json'),
                JSON.stringify(output, null, 2),
              );
              return output;
            },
          },
        },
        {
          provide: AgentDomainService,
          useValue: {
            ownerBusinesses: async (user) =>
              owners.includes(user.firebaseId) ? businesses : [],
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: async () => null },
        },
        {
          provide: getRepositoryToken(Delegation),
          useValue: {
            findOne: async () => ({
              status: DelegationStatus.ACTIVE,
              scopes: [
                DelegationScope.DOCUMENTS_READ,
                DelegationScope.DOCUMENTS_WRITE,
              ],
            }),
          },
        },
      ],
    }).compile();
    service = module.get(OnboardingService);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 30000);
  afterAll(async () => {
    delete process.env.AGENT_ONBOARDING_ENABLED;
    try {
      if (app) await app.close();
    } finally {
      if (db?.isInitialized) {
        try {
          await cleanupOwners(db, owners);
        } finally {
          await db.destroy();
        }
      }
    }
  }, 30000);
  function get(path: string, owner = owners[0]) {
    return request(app.getHttpServer())
      .get('/api/agent-profile' + path)
      .set('authorization', 'Bearer ' + owner);
  }
  function post(path: string, body: any, owner = owners[0]) {
    return request(app.getHttpServer())
      .post('/api/agent-profile/' + path)
      .set('authorization', 'Bearer ' + owner)
      .send(body);
  }
  function fact(
    field: string | null,
    scope: string,
    statement: string,
    overrides = {},
  ) {
    return {
      field,
      scope,
      statement,
      value: statement,
      state: 'known',
      replaces: null,
      change: 'add',
      effectiveDate: null,
      precision: 'unknown',
      evidence: [statement],
      invalidates: [],
      workplaceModes: null,
      ...overrides,
    };
  }
  it('requires authentication and explicit owned business selection', async () => {
    await request(app.getHttpServer())
      .get('/api/agent-profile/businesses')
      .expect(401);
    await get('').expect(400);
    await get('?businessNumber=not-owned').expect(400);
    const listed = await get('/businesses').expect(200);
    expect(listed.body).toHaveLength(2);
    snapshot = (await get('?businessNumber=771111').expect(200)).body;
    expect(snapshot.version).toEqual({ person: 0, business: 0 });
    expect(snapshot.missing).toHaveLength(11);
  });
  it('round-trips a preview through HTTP and ignores injected facts in the commit body', async () => {
    extraction = {
      facts: [
        fact('preferred_name', 'person', 'דני'),
        fact('activity', 'business', 'מעצב גרפי'),
        fact(null, 'business', 'רוצה למכור תבניות'),
      ],
      clarification: null,
    };
    proposal = (
      await post('propose', {
        businessNumber: '771111',
        version: snapshot.version,
        message: 'דני מעצב גרפי רוצה למכור תבניות',
      }).expect(201)
    ).body;
    const unchanged = (await get('?businessNumber=771111').expect(200)).body;
    expect(unchanged.facts).toHaveLength(0);
    snapshot = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: proposal.id,
        facts: [{ statement: 'תוכן מוזרק' }],
      }).expect(201)
    ).body;
    expect(snapshot.facts).toHaveLength(3);
    expect(snapshot.story.person).toContain('דני');
    expect(snapshot.story.business).toContain('תבניות');
    expect(JSON.stringify(snapshot)).not.toContain('תוכן מוזרק');
    const reopened = (await get('?businessNumber=771111').expect(200)).body;
    expect(reopened).toEqual(snapshot);
    const replay = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: proposal.id,
      }).expect(201)
    ).body;
    expect(replay.version).toEqual(snapshot.version);
    expect(replay.facts).toHaveLength(3);
  });
  it('preserves a shared personal profile without leaking business narrative', async () => {
    const otherBusiness = (await get('?businessNumber=772222').expect(200))
      .body;
    expect(otherBusiness.story.person).toContain('דני');
    expect(otherBusiness.story.business).toBe('');
    const otherOwner = (
      await get('?businessNumber=771111', owners[1]).expect(200)
    ).body;
    expect(otherOwner.facts).toHaveLength(0);
    expect(otherOwner.story.person).toBe('');
    await post(
      'commit',
      { businessNumber: '771111', proposalId: proposal.id },
      owners[1],
    ).expect(404);
    await get('/businesses', owners[1])
      .set('x-client-user-id', owners[0])
      .expect(403);
  });
  it('keeps skip and unknown responses across reload and advances to a missing question', async () => {
    snapshot = (await get('?businessNumber=771111').expect(200)).body;
    const p = (
      await post('propose', {
        businessNumber: '771111',
        version: snapshot.version,
        skipField: 'employment',
      }).expect(201)
    ).body;
    snapshot = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: p.id,
      }).expect(201)
    ).body;
    expect(snapshot.fields.find((f) => f.key === 'employment').state).toBe(
      'skipped',
    );
    expect(snapshot.missing).not.toContain('employment');
    extraction = {
      facts: [
        fact('vehicle', 'business', 'לא יודע', {
          value: null,
          state: 'unknown',
        }),
      ],
      clarification: null,
    };
    const unknown = (
      await post('propose', {
        businessNumber: '771111',
        version: snapshot.version,
        message: 'לא יודע',
      }).expect(201)
    ).body;
    snapshot = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: unknown.id,
      }).expect(201)
    ).body;
    expect(snapshot.fields.find((f) => f.key === 'vehicle').state).toBe(
      'unknown',
    );
    expect(snapshot.turns.at(-1).assistant_text).toBe(
      snapshot.fields.find((f) => f.state === 'unasked').question,
    );
  });
  it('deletes onboarding fact history and source copies through the HTTP endpoint', async () => {
    const target = snapshot.facts.find((f) => f.field_key === 'activity');
    snapshot = (
      await post('forget', {
        businessNumber: '771111',
        factId: target.id,
        version: snapshot.version,
      }).expect(201)
    ).body;
    expect(snapshot.facts.some((f) => f.field_key === 'activity')).toBe(false);
    expect(snapshot.story.business).not.toContain('מעצב גרפי');
    expect(snapshot.story.business).toContain('תבניות');
    expect(JSON.stringify(snapshot.turns)).not.toContain('מעצב גרפי');
    expect(snapshot.story.narrative).not.toContain('מעצב גרפי');
    const stored = await db.query(
      'SELECT source_text,payload FROM agent_onboarding_proposals WHERE id=? AND owner_uid=?',
      [proposal.id, owners[0]],
    );
    expect(JSON.stringify(stored)).not.toContain('מעצב גרפי');
  });
  it('keeps a narrative plan even when the extractor omits it from summary facts', async () => {
    snapshot = (await get('?businessNumber=771111').expect(200)).body;
    extraction = {
      facts: [fact('activity', 'business', 'סטודיו')],
      clarification: null,
    };
    const message = 'סטודיו. אני מתכנן לפתח קורס דיגיטלי לאנשי מקצוע.';
    const preview = (
      await post('propose', {
        businessNumber: '771111',
        version: snapshot.version,
        message,
      }).expect(201)
    ).body;
    const saved = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: preview.id,
      }).expect(201)
    ).body;
    expect(saved.story.narrative).toContain('קורס דיגיטלי');
    const reopened = (await get('?businessNumber=771111').expect(200)).body;
    expect(reopened.story.narrative).toContain(message);
    const context = await service.context(
      {
        actorFirebaseId: owners[0],
        firebaseId: owners[0],
        businessNumber: null,
        delegationScopes: [],
        isDelegatedAccess: false,
        isAdminImpersonation: false,
      },
      '771111',
    );
    expect(context).toContain('קורס דיגיטלי');
  });
  it('recovers from invalid model output without writing bogus facts or losing the story', async () => {
    const before = (await get('?businessNumber=771111').expect(200)).body;
    extraction = {
      facts: [
        {
          field: 'preferred_name',
          scope: 'business',
          statement: 'תוכן לא תקין',
        },
      ],
      clarification: null,
    };
    const message = 'אני מתכנן להקים סניף נוסף';
    const preview = (
      await post('propose', {
        businessNumber: '771111',
        version: before.version,
        message,
      }).expect(201)
    ).body;
    expect(preview.facts).toEqual([]);
    expect(preview.clarification).toBeTruthy();
    const saved = (
      await post('commit', {
        businessNumber: '771111',
        proposalId: preview.id,
      }).expect(201)
    ).body;
    expect(saved.story.narrative).toContain(message);
    expect(saved.facts).toEqual(before.facts);
    expect(saved.fields.find((f) => f.key === 'preferred_name').value).toBe(
      'דני',
    );
  });
  it('uses real model extraction and persists free narrative plus simultaneous workplaces', async () => {
    if (!process.env.OPENAI_API_KEY)
      throw new Error(
        'OPENAI_API_KEY required for the explicitly requested model-to-DB smoke test',
      );
    const owner = owners[2];
    const initial = (await get('?businessNumber=771111', owner).expect(200))
      .body;
    live = true;
    try {
      const message =
        'אני דני, מעצב גרפי עצמאי ועוסק פטור. אני גם שכיר יומיים בשבוע. מאוקטובר 2026 אני עובד גם בבית וגם במשרד שכור. בעתיד אני רוצה למכור תבניות דיגיטליות.';
      const preview = (
        await post(
          'propose',
          { businessNumber: '771111', version: initial.version, message },
          owner,
        ).expect(201)
      ).body;
      const workplace = preview.facts.find((f) => f.field === 'workplace');
      expect(workplace).toMatchObject({
        precision: 'month',
        effectiveDate: '2026-10',
      });
      expect(workplace.workplaceModes).toEqual(
        expect.arrayContaining(['home', 'office']),
      );
      const saved = (
        await post(
          'commit',
          { businessNumber: '771111', proposalId: preview.id },
          owner,
        ).expect(201)
      ).body;
      const reopened = (await get('?businessNumber=771111', owner).expect(200))
        .body;
      expect(reopened.version).toEqual(saved.version);
      expect(reopened.story.narrative).toContain('תבניות');
      expect(
        reopened.fields.find((f) => f.key === 'preferred_name').value,
      ).toContain('דני');
      const workplaceField = reopened.fields.find((f) => f.key === 'workplace');
      expect(workplaceField.value).toContain('בית');
      expect(workplaceField.value).toContain('משרד');
      const context = await service.context(
        {
          actorFirebaseId: owner,
          firebaseId: owner,
          businessNumber: null,
          delegationScopes: [],
          isDelegatedAccess: false,
          isAdminImpersonation: false,
        },
        '771111',
      );
      expect(context).toContain('תבניות');
    } finally {
      live = false;
    }
  }, 90000);
});
