import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClientPanelService } from '../services/clients-panel.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private clientService: ClientPanelService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let token = localStorage.getItem('token');
    let clientUserId = this.clientService.getSelectedClientId();

    let headers = req.headers;

    //Add Authorization token if available
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    //Add `x-client-user-id` if acting on behalf of a client
    if (clientUserId) {
      headers = headers.set('x-client-user-id', clientUserId);
    }

    //Clone request with updated headers
    const modifiedReq = req.clone({ headers });

    return next.handle(modifiedReq);
  }
}
