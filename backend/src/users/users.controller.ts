import { Body, Controller, Post, Get, Patch, Delete, Headers,
         Param, Query, NotFoundException, Session, UseGuards, Req} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';

@Controller('auth')
// @Serialize(UserDto)
export class UsersController {

    constructor(
        private userService: UsersService,
        private authService: AuthService
    ) {}

    @Post('/signup')
    async createUser(@Body() body: any) {
        console.log("debug create user body is ", body);
        const user = await this.userService.signup(body);
        return body; //TODO: Elazar - check if it's necessary to return the body
    }

    @Post('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Body() body: any) {     
        const user = await this.userService.signin(body.token);  
        return user[0];
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
    async updateUser(@Headers('token') token: string, @Body() body: any) {  
        console.log("update-user - data is ", body);
        const userId = await this.userService.getFirbsaeIdByToken(token)
        return this.userService.updateUser (userId, body);
    }

}
