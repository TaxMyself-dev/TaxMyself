import { Module } from '@nestjs/common';
import { DocumentAiStore } from './document-ai.store';
@Module({ providers: [DocumentAiStore], exports: [DocumentAiStore] })
export class DocumentAiModule {}
