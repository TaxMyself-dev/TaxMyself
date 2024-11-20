import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn
} from 'typeorm'

@Entity()
export class Income {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplier: string;

  @Column()
  supplierID: string;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column('date')
  date: Date;

  @Column()
  businessNumber: string;

  @Column({ nullable: true })
  note: string;

  @Column()
  file: string;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column()
  incomeNumber: string;

  @Column('int')
  transId: number;

  @Column('boolean')
  isReported: boolean;

}