import { Expose, Transform } from "class-transformer";
import { User } from "src/users/user.entity";

export class ExpenseDto {

    @Expose()
    id: number; 

    @Expose()
    price: number;

    @Expose()
    date: string; 

    @Transform(({ obj}) => obj.user.id)
    @Expose()
    userId: number;
}