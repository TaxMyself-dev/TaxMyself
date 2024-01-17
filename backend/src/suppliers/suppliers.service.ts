import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Supplier } from './supplier.entity';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SupplierResponseDto } from './dtos/supplier-response.dto';

@Injectable()
export class SuppliersService {
    
    constructor
    (
        @InjectRepository(Supplier) private supplier_repo: Repository<Supplier>,
    ) {}

    async addSupplier(supplier: Partial<Supplier>, userId: string): Promise<Supplier> {
        console.log("addSupplier - start");
        const newSupplier = this.supplier_repo.create(supplier);
        newSupplier.userId = userId;
        return await this.supplier_repo.save(newSupplier);
    }

    async getSupplierNamesByUserId(userId: string): Promise<SupplierResponseDto[]> {
        const suppliers = await this.supplier_repo.find({where: { userId }});
        return suppliers.map((supplier) => {
            const { userId, ...supplierData } = supplier; // Exclude userId
            return supplierData;
        });
    }

    async getSupplierById(id: number, userId: string): Promise<SupplierResponseDto> {
        const supplier = await this.supplier_repo.findOne({where: { id }});
        if (!supplier) {
          throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
        if (supplier.userId !== userId) {
          throw new UnauthorizedException(`You do not have permission to access this supplier`);
        }
        const { userId: omitUserId, ...supplierData } = supplier;
        return supplierData;
    }

    async updateSupplier(id: number, userId: string, updateSupplierDto: UpdateSupplierDto): Promise<Supplier> {

        const supplier = await this.supplier_repo.findOne({ where: { id } });
    
        if (!supplier) {
            throw new NotFoundException(`Supplier with ID ${id} not found`);
        }

        // Check if the user making the request is the owner of the expense
        if (supplier.userId !== userId) {
            throw new UnauthorizedException(`You do not have permission to update this supplier`);
        }

        return this.supplier_repo.save({
            ...supplier,
            ...updateSupplierDto,
        });
    
    }

    async deleteSupplier(id: number, userId: string): Promise<void> {

        const supplier = await this.supplier_repo.findOne({ where: { id } });
    
        if (!supplier) {
          throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
    
        // Check if the user making the request is the owner of the expense
        //if (supplier.userId !== userId) {
        //  throw new UnauthorizedException(`You do not have permission to delete this supplier`);
        //}
    
        // Delete the expense from the database
        await this.supplier_repo.remove(supplier);

    }

}
