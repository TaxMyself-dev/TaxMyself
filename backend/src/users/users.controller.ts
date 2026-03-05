import { Body, Controller, Post, Get, Patch, Delete, Headers,
         Param, Query, NotFoundException, Session, UseGuards, Req, HttpException, HttpStatus} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';

@Controller('auth')
export class UsersController {

    constructor(
        private userService: UsersService,
        private authService: AuthService
    ) {}

    
    @Post('/signup')
    async createUser(@Body() body: any) {
        const user = await this.userService.signup(body);
        return body; //TODO: Elazar - check if it's necessary to return the body
    }


    @Get('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Req() request: AuthenticatedRequest) { 
        const userId = request.user?.firebaseId;    
        const user = await this.userService.signin(userId);  
        return user;
    }


    @Get('/get-user')
    async getUser(@Headers('token') token: string) {
        try {
            const userId = await this.userService.getFirbsaeIdByToken(token);
            const user = await this.userService.findFireUser(userId);
            if (user) {                
                return user;
            }
            throw new NotFoundException("user not exist");
        } 
        catch (error) { 
        }
    }


    @Patch('update-user')
    @UseGuards(FirebaseAuthGuard)
    async updateUser(@Req() request: AuthenticatedRequest, @Body() body: any) {
        const userId = request.user?.firebaseId;
        return this.userService.updateUser(userId, body);
    }

    @Get('get-cities')
    async getCities() {
      return this.userService.getCities();
    }

    @Get('all-users')
    @UseGuards(FirebaseAuthGuard)
    async getAllUsers(@Req() request: AuthenticatedRequest) {
      const firebaseId = request.user?.firebaseId;
      
      // Check if user is admin
      const isAdmin = await this.userService.isAdmin(firebaseId);
      if (!isAdmin) {
        throw new HttpException('Admin access required', HttpStatus.FORBIDDEN);
      }

      return this.userService.getAllUsers();
    }

}
