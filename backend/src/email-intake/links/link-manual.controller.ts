import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FirebaseAuthGuard } from '../../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../../interfaces/authenticated-request.interface';
import { LinkManualService } from './link-manual.service';
import { LINK_MAX_BYTES } from './link-policy';
@Controller('integrations/document-links')
@UseGuards(FirebaseAuthGuard)
export class LinkManualController {
  constructor(readonly links: LinkManualService) {}
  private owner(request: AuthenticatedRequest) {
    const user = request.user;
    if (
      !user?.firebaseId ||
      request.isAdminImpersonation ||
      request.isDelegatedAccess ||
      (user.actorFirebaseId && user.actorFirebaseId !== user.firebaseId)
    )
      throw new ForbiddenException('Mailbox access is owner only');
    return user.firebaseId;
  }
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') business: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.links.list(this.owner(request), business, cursor);
  }
  @Get(':id/original')
  async original(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('businessNumber') business: string,
    @Res() response: Response,
  ) {
    const url = await this.links.original(this.owner(request), id, business);
    response.setHeader('Cache-Control', 'no-store');
    return response.json({ url });
  }
  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: LINK_MAX_BYTES, files: 1, fields: 1, parts: 2 },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('businessNumber') business: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('PDF file required');
    return this.links.replace(this.owner(request), id, business, file);
  }
}
