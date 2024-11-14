import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Bill } from './bill.entity';
import { SourceType } from 'src/enum';


@Entity()
export class Source {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceName: string;

  @Column({
    type: 'enum',
    enum: SourceType,
    enumName: 'SourceType',
    default: SourceType.CREDIT_CARD
  })
  sourceType: SourceType;

  @ManyToOne(type => Bill, bill => bill.sources)
  bill: Bill;

}