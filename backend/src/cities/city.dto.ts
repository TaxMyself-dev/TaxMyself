import { IsString } from 'class-validator';

export class CityDto {
  @IsString()
  english_name: string;

  @IsString()
  lishka: string;

  @IsString()
  name: string;

  @IsString()
  semel_lishkat_mana: string;

  @IsString()
  semel_moatza_ezorit: string;

  @IsString()
  semel_napa: string;

  @IsString()
  semel_yeshuv: string;

  @IsString()
  shem_moaatza: string;

  @IsString()
  shem_napa: string;
}