## Purpose
Static reference data: the Israeli cities/settlements list (from a government source dataset), normalized into a typed DTO. No controller, service, module, or HTTP endpoints — pure data + mapping consumed directly by other modules.

## Key entities/files
- `cities.json` — raw government dataset (Hebrew column names, e.g. `שם_ישוב`, `סמל_ישוב`).
- `raw-city-record.interface.ts` — `RawCityRecord`: typed shape of a raw JSON row.
- `city.dto.ts` — `CityDto`: normalized English-keyed shape (`name`, `english_name`, `lishka`, `shem_napa`, `shem_moaatza`, various `semel_*` codes) with `class-validator` decorators.
- `city.mapper.ts` — `mapRawToCityDto(raw)`: converts one raw record to `CityDto`.
- `cities.data.ts` — loads `cities.json` via `require`, maps every row through `mapRawToCityDto`, exports the final `cities: CityDto[]` array.

## Main flows
- No runtime flow of its own — `cities.data.ts` computes the mapped array once at module-load time.
- Consumed by `UsersService.getCities()` (`backend/src/users/users.service.ts`), which just returns the static array; presumably surfaced to the frontend for an address/city picker.

## Related topics
- users (`UsersService.getCities()` is the only consumer of the `cities` array)
