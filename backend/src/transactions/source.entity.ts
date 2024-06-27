import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Bill } from './bill.entity';

@Entity()
export class Source {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceName: string;

  @ManyToOne(type => Bill, bill => bill.sources)
  bill: Bill;

}