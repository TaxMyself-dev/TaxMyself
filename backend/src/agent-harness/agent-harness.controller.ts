import {
  All,
  Controller,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { RequiredDelegationScope } from 'src/decorators/required-delegation-scope.decorator';
import { DelegationScope } from 'src/delegation/delegation.entity';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { AgentHarnessService, AgentHarnessUser } from './agent-harness.service';

/**
 * Every agent request (/api/agent/*: the chat, its stream, stop, steer and
 * follow-ups, and the agent's server functions) after FirebaseAuthGuard
 * verified the caller. The request goes to the agent package as a web
 * Request — its body as the raw stream (main.ts leaves /api/agent unparsed)
 * — and the agent's Response comes back as it is, streamed.
 *
 * The agent's conversations, memory and settings belong to the person acting
 * (actorFirebaseId); the data owner and delegation context travel with the
 * request for the agent's domain tools. Using the agent is a read of the
 * client's data in delegation terms (DOCUMENTS_READ): it writes only its own
 * tables, owned by the actor, and every future domain action keeps its own
 * guard.
 */
@Controller('api/agent')
@UseGuards(FirebaseAuthGuard)
export class AgentHarnessController {
  private readonly logger = new Logger(AgentHarnessController.name);

  constructor(private readonly agentHarnessService: AgentHarnessService) {}

  @All('*')
  @RequiredDelegationScope(DelegationScope.DOCUMENTS_READ)
  async serve(
    @Req() req: AuthenticatedRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const user: AgentHarnessUser = {
      actorFirebaseId: req.user.actorFirebaseId ?? req.user.firebaseId,
      firebaseId: req.user.firebaseId,
      businessNumber: req.user.businessNumber ?? null,
      delegationScopes: req.user.delegationScopes ?? [],
      isDelegatedAccess: req.isDelegatedAccess === true,
      isAdminImpersonation: req.isAdminImpersonation === true,
    };

    // The page leaving ends what follows its request (a resumed stream),
    // never an answer: the agent ignores this signal for the chat itself.
    const disconnected = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        disconnected.abort();
      }
    });

    let response: Response;

    try {
      response = await this.agentHarnessService.handle(
        toWebRequest(req, disconnected.signal),
        user,
      );
    } catch (error) {
      this.logger.error(
        'AGENT_REQUEST_FAILED',
        error instanceof Error ? error.stack : String(error),
      );
      res.status(503).json({
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: 'The agent is not available right now.',
        },
      });
      return;
    }

    await sendWebResponse(response, res);
  }
}

// The Express request as a web Request: the URL the agent's routes match
// (/api/agent/...), the headers, and the unparsed body stream.
const toWebRequest = (req: AuthenticatedRequest, signal: AbortSignal) => {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const url = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  return new Request(url, {
    method: req.method,
    headers,
    signal,
    ...(hasBody && {
      body: Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>,
      duplex: 'half',
    }),
  } as RequestInit);
};

// The agent's web Response, streamed to the Express response as it comes
// (the chat answer streams for minutes; nothing is buffered).
const sendWebResponse = async (response: Response, res: ExpressResponse) => {
  res.status(response.status);
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  res.flushHeaders();

  await new Promise<void>((resolve) => {
    const body = Readable.fromWeb(
      response.body as unknown as NodeWebReadableStream<Uint8Array>,
    );
    body.on('error', () => {
      res.destroy();
      resolve();
    });
    res.on('close', () => {
      body.destroy();
      resolve();
    });
    body.pipe(res);
  });
};
