import { RawCityRecord } from './raw-city-record.interface';
import { CityDto } from './city.dto';

export function mapRawToCityDto(raw: RawCityRecord): CityDto {
  return {
    english_name: raw['שם_ישוב_לועזי']?.trim() || '',
    lishka: raw['לשכה']?.trim() || '',
    name: raw['שם_ישוב']?.trim() || '',
    semel_lishkat_mana: String(raw['סמל_לשכת_מנא']),
    semel_moatza_ezorit: String(raw['סמל_מועצה_איזורית']),
    semel_napa: String(raw['סמל_נפה']),
    semel_yeshuv: raw['סמל_ישוב']?.trim() || '',
    shem_moaatza: raw['שם_מועצה']?.trim() || '',
    shem_napa: raw['שם_נפה']?.trim() || '',
  };
}