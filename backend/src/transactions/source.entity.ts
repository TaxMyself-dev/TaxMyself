import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Unique } from 'typeorm';
import { Bill } from './bill.entity';
import { SourceType } from 'src/enum';


@Entity()
@Unique(['userId', 'sourceName'])
export class Source {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: string;

  @Column()
  sourceName: string;

  @Column({
    type: 'enum',
    enum: SourceType,
    enumName: 'SourceType',
    nullable: false,
  })
  sourceType: SourceType;

  @Column({ name: 'feezback_resource_id', type: 'varchar', length: 256, nullable: true, default: null })
  feezbackResourceId: string | null;

  @ManyToOne(() => Bill, bill => bill.sources)
  bill: Bill;

}