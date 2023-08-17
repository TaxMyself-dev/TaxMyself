import {
    CanActivate,
    ExecutionContext
} from '@nestjs/common';
import { Observable } from 'rxjs';

//export class AuthGuard implements CanActivate {
//    canActivate(context: ExecutionContext) {
//        const request = context.switchToHttp().getRequest();
//        return request.session.userId;
//    }
//}

export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        console.log("abababab");
        //console.log(request);
        return request.session.userId;
    }
}