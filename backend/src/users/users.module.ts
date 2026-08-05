import { forwardRef, Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { Child } from './child.entity';
import { SharedModule } from 'src/shared/shared.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { FeezbackModule } from '../feezback/feezback.module';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Child, Business, Delegation, SettingDocuments]),
    SharedModule,
    forwardRef(() => FeezbackModule),
    GoogleDriveModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    AuthService,
    FirebaseAuthGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
