import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { User } from '../users/user.entity';
import { GoogleDriveService } from './google-drive.service';

@Controller('users')
export class GoogleDriveController {
  constructor(
    private readonly driveService: GoogleDriveService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  @Get('me/drive-folder')
  @UseGuards(FirebaseAuthGuard)
  async getMyDriveFolder(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('user not exist');

    const user = await this.userRepo.findOne({ where: { firebaseId } });
    if (!user) throw new NotFoundException('user not exist');
    if (!user.driveFolderId) {
      throw new NotFoundException('Drive folder not provisioned for this user');
    }

    return {
      folderId: user.driveFolderId,
      folderUrl: this.driveService.getFolderUrl(user.driveFolderId),
    };
  }
}
