import {
  All,
  Controller,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { RequiredDelegationScope } from 'src/decorators/required-delegation-scope.decorator';
import { DelegationScope } from 'src/delegation/delegation.entity';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { AgentDomainError, AgentDomainService } from './agent-domain.service';
import { AgentHarnessService, AgentHarnessUser } from './agent-harness.service';

// The chat reads its own body with its own limit (a message with up to five
// 10 MB attachments, readAgentChatRequest); every other agent route takes a
// small JSON body, capped here before the agent reads it.
const agentChatPath = '/api/agent/chat';
const agentBodyLimitBytes = 1024 * 1024;

/**
 * Every agent request (/api/agent/*: the chat, its stream, stop, steer and
 * follow-ups, and the agent's server functions) after FirebaseAuthGuard
 * verified the caller. The request goes to the agent package as a web
 * Request — its body as the raw stream (main.ts leaves /api/agent unparsed)
 * — and the agent's Response comes back as it is, streamed.
 *
 * The agent's conversations, memory and settings belong to the pair (the
 * person acting, actorFirebaseId; the data owner, firebaseId) and each
 * conversation to the verified business it started in: an accountant's data
 * about one client never reaches another, or the accountant's own. A revoked
 * delegation is refused here by the guard, and by the domain tools on every
 * call of an answer already running. Using the agent is a read of the
 * client's data in delegation terms (DOCUMENTS_READ): it writes only its own
 * tables, owned by the actor, and every future domain action keeps its own
 * guard.
 */
@Controller('api/agent')
@UseGuards(FirebaseAuthGuard)
export class AgentHarnessController {
  private readonly logger = new Logger(AgentHarnessController.name);

  constructor(
    private readonly agentHarnessService: AgentHarnessService,
    private readonly agentDomain: AgentDomainService,
  ) {}

  @All('*')
  @RequiredDelegationScope(DelegationScope.DOCUMENTS_READ)
  async serve(
    @Req() req: AuthenticatedRequest,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    // The client left while the guard ran: nothing to serve.
    if (req.destroyed || res.destroyed) {
      return;
    }

    if (exceedsBodyLimit(req)) {
      res.status(413).json({
        error: { code: 'AGENT_INVALID_INPUT', message: 'The request is too large.' },
      });
      return;
    }

    // The business comes from the app's header, which the guard passes on
    // unchecked: it must be one of the data owner's. The agent keys a
    // conversation to it, so a chat started in one business is never
    // continued, listed or read from another.
    let businessNumber: string | null;

    try {
      businessNumber = await this.agentDomain.requestBusiness(
        req.user.firebaseId,
        req.user.businessNumber,
      );
    } catch (error) {
      if (error instanceof AgentDomainError && error.code === 'AGENT_BUSINESS_FORBIDDEN') {
        res.status(403).json({
          error: {
            code: 'AGENT_BUSINESS_FORBIDDEN',
            message: 'The business is not one of the account\'s businesses.',
          },
        });
        return;
      }
      throw error;
    }

    const user: AgentHarnessUser = {
      actorFirebaseId: req.user.actorFirebaseId ?? req.user.firebaseId,
      firebaseId: req.user.firebaseId,
      businessNumber,
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
        'AGENT_UNAVAILABLE',
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

const isChatRequest = (req: AuthenticatedRequest) =>
  req.path === agentChatPath;

// A declared body past the limit, on a route other than the chat.
const exceedsBodyLimit = (req: AuthenticatedRequest) =>
  !isChatRequest(req) &&
  Number(req.headers['content-length'] ?? 0) > agentBodyLimitBytes;

// The body as it streams, failing once it passes the limit (a body sent
// without its length, or with a false one).
const limitBody = (limit: number) => {
  let received = 0;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      callback(
        received > limit ? new Error('AGENT_BODY_TOO_LARGE') : null,
        chunk,
      );
    },
  });
};

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
  const body = isChatRequest(req)
    ? req
    : req.pipe(limitBody(agentBodyLimitBytes));

  return new Request(url, {
    method: req.method,
    headers,
    signal,
    ...(hasBody && {
      body: Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>,
      duplex: 'half',
    }),
  } as RequestInit);
};

// The agent's web Response, streamed to the Express response as it comes
// (the chat answer streams for minutes; nothing is buffered). A client that
// leaves ends the copy: the agent's own reader stops following, while the
// answer itself goes on.
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

  try {
    await pipeline(
      Readable.fromWeb(
        response.body as unknown as NodeWebReadableStream<Uint8Array>,
      ),
      res,
    );
  } catch {
    // The client left or the stream failed mid-way: the response is over.
    res.destroy();
  }
};
