import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from 'src/users/auth.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private usersService: UsersService
    ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    console.log("AdminGuard - start");
    const token = request.body.token;
    
    if (!token) return false;

    const userId = await this.usersService.getFirbsaeIdByToken(token);
    if (!userId) return false;

    return this.usersService.isAdmin(userId);
  }
  
}