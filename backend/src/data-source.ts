import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/**/*.entity.{js,ts}'], // Automatically load all entity files
  migrations: ['dist/migrations/*.js'], // Ensure migrations are found in dist/
  migrationsTableName: 'migrations_history',
  synchronize: false,
  logging: true,
});



// import { DataSource } from 'typeorm';
// import { User } from './users/user.entity';
// import { Child } from './users/child.entity';
// import { Expense } from './expenses/expenses.entity';
// import { Income } from './expenses/incomes.entity';
// import { Supplier } from './expenses/suppliers.entity';
// import { Transactions } from './transactions/transactions.entity';
// import { ClassifiedTransactions } from './transactions/classified-transactions.entity';
// import { Bill } from './transactions/bill.entity';
// import { Source } from './transactions/source.entity';
// import { DefaultCategory } from './expenses/default-categories.entity';
// import { DefaultSubCategory } from './expenses/default-sub-categories.entity';
// import { UserCategory } from './expenses/user-categories.entity';
// import { UserSubCategory } from './expenses/user-sub-categories.entity';
// import { Finsite } from './finsite/finsite.entity';
// import { Delegation } from './delegation/delegation.entity';


// export const AppDataSource = new DataSource({
//   type: 'mysql',
//   host: process.env.DB_HOST,
//   port: Number(process.env.DB_PORT),
//   username: process.env.DB_USERNAME,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_DATABASE,
//   entities: [User, Child, Expense, Income, Supplier, Transactions, ClassifiedTransactions, Bill, Source, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Finsite, Delegation],
//   migrations: ['dist/migrations/*.js'], // Compiled migration files
//   migrationsTableName: 'migrations_history',
//   synchronize: false, // Disable auto-sync in production
//   logging: true, // Enable logging for debugging
//   timezone: 'Z',
// });
