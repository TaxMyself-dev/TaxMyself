export interface IMenuItem {
    label: string;
    icon?: string;
    routerLink?: string;
    command?: (event?: any) => void;
}