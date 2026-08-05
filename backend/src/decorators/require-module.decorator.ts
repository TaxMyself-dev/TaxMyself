import { SetMetadata } from '@nestjs/common';
import { ModuleName } from 'src/enum';

export const REQUIRE_MODULE_KEY = 'requiredModule';
export const RequireModule = (module: ModuleName) => SetMetadata(REQUIRE_MODULE_KEY, module);
