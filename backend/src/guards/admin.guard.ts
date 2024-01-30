import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from 'src/users/auth.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private authService: AuthService,
        private userService: UsersService
    ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1]; // Assuming token is sent as "Bearer TOKEN"
    if (!token) return false;

    const userId = await this.authService.getFirbsaeIdByToken(token);
    if (!userId) return false;

    return this.userService.isAdmin(userId);
  }
  
}