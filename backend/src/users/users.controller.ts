import { Body, Controller, Post, Get, Patch, Delete,
         Param, Query, NotFoundException, Session, UseGuards, Req} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

@Controller('auth')
// @Serialize(UserDto)
export class UsersController {

    constructor(
        private userService: UsersService,
        private authService: AuthService
    ) {}

    @Post('/signup')
    async createUser(@Body() body: any) {
        const user = await this.userService.signup(body);
        console.log("new user", user);
        return body; //TODO: Elazar - check if it's necessary to return the body
    }

    @Post('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Body() body: any) {     
        const user = await this.userService.signin(body.token);  
        return user[0];
    }

    @Get('/get-user')
    async getUser(@Query() token: any) {
        try {
            const userID = await this.userService.getFirbsaeIdByToken(token.token);
            const user = await this.userService.findFireUser(userID);
            if (user) {
                return user;
            }
            throw new NotFoundException("user not exist");
        } 
        catch (error) {
            
        }
    }
    // @Post('/signout')
    // signOut(@Session() session: any) {
    //     session.userId = null;
    // }

    // @Delete('/:id')
    // removeUser(@Param('id') id: string) {
    //     return this.userService.remove(parseInt(id));
    // }

    // @Patch('/:id')
    // updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    //     return this.userService.update(parseInt(id), body);
    // }

}
