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
//import { Request } from 'express';
import { Request } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

@Controller('auth')
//@UseGuards(FirebaseAuthGuard)
@Serialize(UserDto)
export class UsersController {

    private defaultApp: any;

    constructor(
        private userService: UsersService,
        private authService: AuthService
    ) {}

    @Post('/signup')
    async createUser(@Body() body: any) {
        console.log("debug_0");
        console.log(body);
        const user = await this.authService.signup(body.formData, body.uid);
        return body;
    }

    @Post('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Body() body: any) {        
        console.log(body);
        const uid = await this.authService.signFire(body.token);
        console.log("firebase is " + uid);
        const user = await this.userService.findFireUser(uid);
        console.log("user is ", user);
        return user;
    }

    @Post('/signout')
    signOut(@Session() session: any) {
        session.userId = null;
    }

    @Get()
    findAllUsers(@Query('email') email: string) {
        return this.userService.find(email);
    }

    @Delete('/:id')
    removeUser(@Param('id') id: string) {
        return this.userService.remove(parseInt(id));
    }

    @Patch('/:id')
    updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
        return this.userService.update(parseInt(id), body);
    }

}
