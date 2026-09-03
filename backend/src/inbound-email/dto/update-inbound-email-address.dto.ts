import { IsString, Length, Matches } from 'class-validator';

export class UpdateInboundEmailAddressDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'localPart must contain only lowercase English letters, numbers and hyphens',
  })
  localPart: string;
}
