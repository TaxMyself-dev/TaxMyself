import { Injectable} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from 'src/expenses/expenses.entity';


@Injectable()
export class CloudService {

  constructor(
    @InjectRepository(Expense)
    private expense_repo: Repository<Expense>,
  ) {}

  async searchExpenses(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    supplier?: string,
    category?: string): Promise<Expense[]> {

    const query = this.expense_repo.createQueryBuilder('expense')
        .select(['expense.supplier', 'expense.date', 'expense.category', 'expense.subCategory', 'expense.sum'])
        .where('expense.userId = :userId', { userId })
        .andWhere('expense.file IS NOT NULL') // Ensure file field is not null
        .orderBy('expense.date', 'DESC');

    if (startDate) {
      query.andWhere('expense.date >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('expense.date <= :endDate', { endDate });
    }

    if (supplier) {
      query.andWhere('expense.supplier = :supplier', { supplier });
    }

    if (category) {
      query.andWhere('expense.category = :category', { category });
    }

    // Limit to last 10 expenses if no additional filters are provided
    if (!startDate && !endDate && !supplier && !category) {
      query.limit(10);
    }

    return query.getMany();
  }

}