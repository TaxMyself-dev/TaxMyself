import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Body for PATCH /expenses/user-category/:id. Only the simple flag is
 * editable; renaming a category is not supported via PATCH — delete the
 * category and add it again to rename.
 */
export class UpdateUserCategoryDto {
  @IsOptional() @IsBoolean() isExpense?: boolean;
}
