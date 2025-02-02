import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentsService,  } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SettingDocuments } from './settingDocuments.entity';


@Module({
  imports: [TypeOrmModule.forFeature([SettingDocuments])],
  controllers: [DocumentsController],
  providers: [
    DocumentsService
  ],
})
export class DocumentsModule {}