// import rawCitiesJson from './cities.json';
import { RawCityRecord } from './raw-city-record.interface';
import { CityDto } from './city.dto';
import { mapRawToCityDto } from './city.mapper';

const rawCitiesJson = require('./cities.json') as RawCityRecord[];

export const cities: CityDto[] = rawCitiesJson.map(mapRawToCityDto);
