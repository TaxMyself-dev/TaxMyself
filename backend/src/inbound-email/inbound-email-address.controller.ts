import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UpdateInboundEmailAddressDto } from './dto/update-inbound-email-address.dto';
import { InboundEmailAddressService } from './inbound-email-address.service';

@Controller('inbound-email')
@UseGuards(FirebaseAuthGuard)
export class InboundEmailAddressController {
  constructor(private readonly addressService: InboundEmailAddressService) {}

  @Get('me/addresses')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.addressService.listForOwner(request.user.firebaseId);
  }

  @Put('me/addresses/:businessNumber')
  updateMine(
    @Req() request: AuthenticatedRequest,
    @Param('businessNumber') businessNumber: string,
    @Body() body: UpdateInboundEmailAddressDto,
  ) {
    return this.addressService.updateForOwner(
      request.user.firebaseId,
      businessNumber,
      body.localPart,
    );
  }
}
