import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentsService,  } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { DocLines } from './doc-lines.entity';


@Module({
  imports: [TypeOrmModule.forFeature([SettingDocuments, Documents, DocLines, Delegation])],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
  ],
})
export class DocumentsModule {}