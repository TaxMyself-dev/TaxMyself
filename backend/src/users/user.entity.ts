import { 
    Entity, 
    Column, 
    PrimaryGeneratedColumn,
 } from 'typeorm';
import { UserRole } from 'src/enum';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    index: number;

    @Column()
    fName: string;
    
    @Column()
    lName: string;

    @Column()
    id: string;

    @Column('timestamp')
    dateOfBirth: Date;

    @Column()
    phone: string;

    @Column()
    email: string;

    @Column()
    city: string;

    @Column()
    spouseFName: string;

    @Column()
    spouseLName: string;

    @Column()
    spouseId: string;

    @Column('timestamp')
    spouseDateOfBirth: Date;

    @Column()
    spouseIndependet: boolean;

    @Column()
    firebaseId: string;

    @Column()
    businessName: string;

    @Column()
    businessField: string;

    @Column()
    businessType: string;

    @Column()
    employee: boolean;

    @Column()
    familyStatus: string;

    

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.FREE_USER,
      })
      role: UserRole;
}