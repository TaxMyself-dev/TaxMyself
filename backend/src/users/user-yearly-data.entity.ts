import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn,
  ManyToOne 
} from 'typeorm';
import { User } from './user.entity';
import { BusinessType } from '../enum';


@Entity()
export class UserYearlyData {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.yearlyData)
  user: User;

  @Column()
  year: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  incomeTaxPrepaymentPercentage: number;

  @Column({
    type: 'enum',
    enum: BusinessType,
  })
  businessType: BusinessType;

  @Column({ default: false })
  businessTypeChanged: boolean;  // Indicates if businessType was changed this year

  @Column({ type: 'timestamp', nullable: true })
  businessTypeChangedDate: Date;  // Timestamp of when businessType was last changed
}
