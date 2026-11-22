import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from '../../interfaces/authenticated-request.interface';
import { withFeezbackUserActivity } from './feezback-user-activity';

@Injectable()
export class FeezbackUserActivityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Subscription (not just creation of next.handle()) must run in this scope.
    // Descendant promises keep it for login/manual fire-and-forget syncs.
    return new Observable(subscriber => withFeezbackUserActivity(request,
      () => next.handle().subscribe(subscriber)));
  }
}
