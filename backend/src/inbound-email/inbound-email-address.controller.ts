import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { SubscriptionGuard } from 'src/guards/subscription.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { InboundEmailAddressService } from './inbound-email-address.service';

@Controller('inbound-email')
@UseGuards(FirebaseAuthGuard, SubscriptionGuard)
export class InboundEmailAddressController {
  constructor(private readonly addressService: InboundEmailAddressService) {}

  @Get('me/addresses')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.addressService.listForOwner(request.user.firebaseId);
  }
}
