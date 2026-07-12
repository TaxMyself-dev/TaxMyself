import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Unique } from 'typeorm';
import { Bill } from './bill.entity';
import { SourceType } from 'src/enum';


// Named explicitly — found unnamed during the schema-drift.md Gap 7 audit
// (2026-07-12). Name confirmed against a fresh re-import of
// _prod_dump/keepintax-prod.sql (ground truth): production's real
// constraint name is IDX_source_userId_sourceName, NOT a hash TypeORM
// would compute for an unnamed decorator — same drop-risk pattern as the
// other 5 tables in Gap 7.
@Entity()
@Unique('IDX_source_userId_sourceName', ['userId', 'sourceName'])
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

  @ManyToOne(() => Bill, bill => bill.sources)
  bill: Bill;

}