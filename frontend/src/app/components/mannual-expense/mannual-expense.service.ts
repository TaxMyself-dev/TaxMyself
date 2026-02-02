import { httpResource } from "@angular/common/http";
import { computed, effect, inject, Injectable, linkedSignal, Resource, signal } from "@angular/core";
import { GenericService } from "src/app/services/generic.service";
import { ICategory, IGetSupplier, ISubCategory } from "src/app/shared/interface";
import { environment } from "src/environments/environment";

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

        return this.subCategoriesResource.value()?.map((item: ISubCategory) => ({
            name: item.subCategoryName,
            value: item.subCategoryName
        })
        ) ?? [];
    })

    // $suppliers = computed(() => {
    //     return this.supplierResource.value()
    // })

    $selectedBusinessNumber = signal<string | null>(null);



    readonly categoriesResource = httpResource<ICategory[]>(() => {
        const selectedBusiness = this.$selectedBusinessNumber();

        if (!selectedBusiness) return undefined;

        return {
            url: `${environment.apiUrl}expenses/get-categories`,
            params: { businessNumber: selectedBusiness },
            method: 'GET',
        };
    })

    readonly subCategoriesResource = httpResource<ISubCategory[]>(() => {
        const selectedCategory = this.$selectedCategory();

        if (!selectedCategory) return undefined;

        return {
            url: `${environment.apiUrl}expenses/get-sub-categories`,
            params: { categoryName: selectedCategory, isExpense: true },
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
