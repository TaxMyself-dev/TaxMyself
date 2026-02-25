import { httpResource } from "@angular/common/http";
import { computed, effect, inject, Injectable, linkedSignal, Resource, signal } from "@angular/core";
import { GenericService } from "src/app/services/generic.service";
import { ICategory, IGetSupplier, ISubCategory, ISupplier } from "src/app/shared/interface";
import { environment } from "src/environments/environment";

// Type for supplier from API (matches backend SupplierResponseDto)
interface SupplierApiResponse {
    supplier: string;
    supplierID: string;
    category: string;
    subCategory: string;
    taxPercent: number;
    vatPercent: number;
    reductionPercent?: number;
    id?: number;
}

@Injectable({
    providedIn: 'root'
})
export class MannualExpenseService {
    gs = inject(GenericService);


    $selectedCategory = signal<string>("");

    businessOptions = this.gs.businessSelectItems;

    showBusinessSelector = computed(() => this.businessOptions().length > 1);

    isSelectBusiness = linkedSignal(() => {
        const showBusinessSelector = this.showBusinessSelector();
        if (!showBusinessSelector) {
            return false;
        }
        return true;
    })

    $categoriesOptions = computed(() => {
        if (this.showBusinessSelector() && !this.$selectedBusinessNumber()) {
            return [];
        }

        return this.categoriesResource.value()?.map((item: ICategory) => ({
            name: item.categoryName,
            value: item.categoryName
        })
        ) ?? [];
    })

    $subCategoriesOptions = computed(() => {
        const subCategories = this.subCategoriesResource.value();
        if (!subCategories || subCategories.length === 0) {
            return [];
        }
        return subCategories.map((item: ISubCategory) => ({
            name: item.subCategoryName,
            value: item.subCategoryName
        }));
    })

    $selectedBusinessNumber = signal<string | null>(null);
    
    // Signal for supplier search query
    $supplierSearchQuery = signal<string>('');
    
    // httpResource for loading suppliers
    readonly suppliersResource = httpResource<SupplierApiResponse[]>(() => {
        const selectedBusiness = this.$selectedBusinessNumber();
        
        if (!selectedBusiness) return undefined;
        
        return {
            url: `${environment.apiUrl}expenses/get-suppliers-list`,
            method: 'GET',
        };
    });
    
    // Computed signal for all suppliers
    $suppliers = computed(() => {
        return this.suppliersResource.value() ?? [];
    });
    
    // Computed signal for filtered suppliers based on search query
    $filteredSuppliers = computed(() => {
        const suppliers = this.$suppliers();
        const query = this.$supplierSearchQuery().toLowerCase();
        
        if (!query) {
            return suppliers;
        }
        
        return suppliers.filter(supplier => {
            const supplierName = supplier.supplier?.toLowerCase() || '';
            const supplierId = supplier.supplierID?.toLowerCase() || '';
            return supplierName.includes(query) || supplierId.includes(query);
        });
    });

    readonly categoriesResource = httpResource<ICategory[]>(() => {
        const selectedBusiness = this.$selectedBusinessNumber();

        if (!selectedBusiness) return undefined;

        return {
            url: `${environment.apiUrl}expenses/get-categories`,
            params: { 
                // businessNumber is sent via header (businessnumber), not query param
                // Backend gets it from request.user?.businessNumber
                isExpense: 'true' 
            },
            method: 'GET',
        };
    })

    readonly subCategoriesResource = httpResource<ISubCategory[]>(() => {
        const selectedCategory = this.$selectedCategory();

        if (!selectedCategory) return undefined;

        return {
            url: `${environment.apiUrl}expenses/get-sub-categories`,
            params: { categoryName: selectedCategory, isExpense: 'true' },
            method: 'GET',
        };
    });

    // readonly supplierResource = httpResource<any[]>(() => {
    //     const isSelectBusiness = this.isSelectBusiness();
    //     const selectedBusiness = this.$selectedBusinessNumber(); // For reload when changed account

    //     if (isSelectBusiness) return undefined;

    //     return {
    //         url: `${environment.apiUrl}expenses/get-suppliers-list`,
    //         method: 'GET',
    //     };
    // });
}
