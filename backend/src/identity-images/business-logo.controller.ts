import { BadRequestException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { RequiredDelegationScope } from '../decorators/required-delegation-scope.decorator';
import { DelegationScope } from '../delegation/delegation.entity';
import { Business } from '../business/business.entity';
import { ImageStorageService, IMAGE_MAX_BYTES } from './image-storage.service';

@Controller('business')
@UseGuards(FirebaseAuthGuard)
export class BusinessLogoController {
  constructor(@InjectRepository(Business) private readonly repo: Repository<Business>, private readonly images: ImageStorageService) {}
  private async owned(req: AuthenticatedRequest, id: number) {
    if (!req.user?.firebaseId) throw new ForbiddenException();
    const business = await this.repo.findOne({ where: { id, firebaseId: req.user.firebaseId } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }
  @Post(':id/logo')
  @RequiredDelegationScope(DelegationScope.DOCUMENTS_READ)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMAGE_MAX_BYTES, files: 1 } }))
  async upload(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    const business = await this.owned(req, id);
    if (!file?.buffer) throw new BadRequestException('Image file is required');
    const imagePath = await this.images.upload('business', business.id, file.buffer);
    await this.repo.update({ id: business.id, firebaseId: req.user.firebaseId }, { logoPath: imagePath });
    return { imagePath };
  }
  @Get(':id/logo')
  @RequiredDelegationScope(DelegationScope.DOCUMENTS_READ)
  async get(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const business = await this.owned(req, id);
    if (!business.logoPath) throw new NotFoundException('Image not found');
    const image = await this.images.download(business.logoPath);
    res.set({ 'Content-Type': image.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(image.buffer);
  }
  @Delete(':id/logo')
  @RequiredDelegationScope(DelegationScope.DOCUMENTS_READ)
  async remove(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const business = await this.owned(req, id);
    // Historical documents can reference the old immutable blob.
    await this.repo.update({ id: business.id, firebaseId: req.user.firebaseId }, { logoPath: null });
    return { imagePath: null };
  }
}
