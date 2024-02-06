import { Body, Controller, Post, Get, Patch, Delete,
         Param, Query, NotFoundException, Session, UseGuards, Req} from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UsersService } from './users.service';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { UserDto } from './dtos/user.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './user.entity';
import { AuthGuard } from 'src/guards/auth.guard';
import { log } from 'console';
import { request } from 'http';
import { Request } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

@Controller('auth')
@Serialize(UserDto)
export class UsersController {

    constructor(
        private userService: UsersService,
        private authService: AuthService
    ) {}

    @Post('/signup')
    async createUser(@Body() body: any) {
        console.log(body);
        const user = await this.userService.signup(body.formData, body.uid);
        return body; //TODO: Elazar - check if it's necessary to return the body
    }

    @Post('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Body() body: any) {     
        const user = await this.userService.signin(body.token);  
        //const uid = await this.authService.getFirbsaeIdByToken(body.token);
        //const user = await this.userService.findFireUser(uid);
        console.log("user is ", user);
        return user;
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
