import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';
import { UsersModule } from 'src/users/users.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { User } from 'src/users/user.entity';
import { GoogleDriveModule } from 'src/google-drive/google-drive.module';
import { FxRateService } from 'src/shared/fx-rate.service';
import { FxRate } from 'src/shared/fx-rate.entity';

@Module({
  // Delegation + User repos are required by FirebaseAuthGuard
  // (admin-bypass path needs the User repo to look up role).
  // GoogleDriveModule exports GoogleDriveService — needed by the
  // sample-file upload step in seed/test-reset for the OCR test profile.
  // FxRate entity + FxRateService — so demo OB transactions are seeded
  // with the SAME BOI rate the OCR pipeline uses on the doc side.
  // Without this the two sides disagree (demo hardcoded 3.7, OCR ~2.94)
  // and the matcher can never pair foreign-currency rows.
  imports: [TypeOrmModule.forFeature([Delegation, User, FxRate]), UsersModule, GoogleDriveModule],
  controllers: [DemoDataController],
  providers: [DemoDataService, FxRateService],
})
export class DemoDataModule {}
