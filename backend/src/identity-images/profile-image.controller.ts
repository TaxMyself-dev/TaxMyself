import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { User } from '../users/user.entity';
import { ImageStorageService, IMAGE_MAX_BYTES } from './image-storage.service';

@Controller('auth/profile-image')
@UseGuards(FirebaseAuthGuard)
export class ProfileImageController {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly images: ImageStorageService,
  ) {}
  private async owned(req: AuthenticatedRequest, mutation = false) {
    if (!req.user?.firebaseId || (mutation && req.user.role === 'agent'))
      throw new ForbiddenException();
    const user = await this.repo.findOne({
      where: { firebaseId: req.user.firebaseId },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  async upload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.owned(req, true);
    if (!file?.buffer) throw new BadRequestException('Image file is required');
    const imagePath = await this.images.upload('user', user.index, file.buffer);
    await this.repo.update(
      { index: user.index, firebaseId: req.user.firebaseId },
      { profileImagePath: imagePath },
    );
    return { imagePath };
  }
  @Get()
  async get(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const user = await this.owned(req);
    if (!user.profileImagePath) throw new NotFoundException('Image not found');
    const image = await this.images.download(user.profileImagePath);
    res
      .set({
        'Content-Type': image.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.buffer);
  }
  @Delete()
  async remove(@Req() req: AuthenticatedRequest) {
    const user = await this.owned(req, true);
    await this.repo.update(
      { index: user.index, firebaseId: req.user.firebaseId },
      { profileImagePath: null },
    );
    return { imagePath: null };
  }
}
