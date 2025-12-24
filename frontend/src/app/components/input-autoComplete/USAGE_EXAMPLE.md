# AutoComplete Component Usage Examples

## Basic Usage

### In your component TypeScript:

```typescript
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InputAutoCompleteComponent } from '@/components/input-autoComplete/input-autoComplete.component';

interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
}

@Component({
  selector: 'app-my-form',
  templateUrl: './my-form.component.html',
  standalone: true,
  imports: [InputAutoCompleteComponent, ReactiveFormsModule]
})
export class MyFormComponent {
  myForm: FormGroup;
  clients = signal<Client[]>([]);
  filteredClients = signal<Client[]>([]);

  constructor(private fb: FormBuilder) {
    this.myForm = this.fb.group({
      clientName: ['', Validators.required]
    });
  }

  ngOnInit() {
    // Load clients from API
    this.loadClients();
  }

  loadClients() {
    // Example: Load from service
    this.clientService.getClients().subscribe(clients => {
      this.clients.set(clients);
    });
  }

  filterClients(event: any) {
    const query = event.query.toLowerCase();
    const filtered = this.clients().filter(client => 
      client.name.toLowerCase().includes(query)
    );
    this.filteredClients.set(filtered);
  }

  onClientSelect(client: Client) {
    console.log('Selected client:', client);
    // Auto-fill other fields if needed
    this.myForm.patchValue({
      email: client.email,
      phone: client.phone
    });
  }

  onAddNewClient(name: string) {
    console.log('Add new client:', name);
    // Handle adding new client
  }
}
```

### In your template HTML:

```html
<form [formGroup]="myForm">
  <app-input-autocomplete
    [parentForm]="myForm"
    controlName="clientName"
    labelText="שם הלקוח"
    placeholder="בחר או הקלד שם לקוח"
    [items]="filteredClients()"
    optionLabel="name"
    (onCompleteMethod)="filterClients($event)"
    (onItemSelect)="onClientSelect($event)"
    [showAddNew]="true"
    addNewLabel="+ הוסף לקוח חדש"
    (onAddNew)="onAddNewClient($event)"
    headerText="לקוחות זמינים"
    [dropdown]="true"
    [forceSelection]="false"
    size="normal"
  />
</form>
```

## Advanced Usage with Custom Template

If you need custom rendering (like flags in the PrimeNG example), you can extend the component:

```typescript
// In the component, add an input for custom template
customItemTemplate = input<TemplateRef<any>>(null);
```

```html
<!-- In the template -->
<p-autoComplete
  [formControlName]="controlName()"
  [suggestions]="filteredItems()"
  (completeMethod)="onComplete($event)"
  (onSelect)="onSelect($event)"
  [optionLabel]="optionLabel()"
  [placeholder]="placeholder()"
  [dropdown]="dropdown()"
  [forceSelection]="forceSelection()"
  [disabled]="disabled()"
  [style]="{ width: '100%' }"
  styleClass="w-full">
  
  @if (customItemTemplate()) {
    <ng-template let-item #item>
      <ng-container *ngTemplateOutlet="customItemTemplate(); context: { $implicit: item }"></ng-container>
    </ng-template>
  }
</p-autoComplete>
```

## Properties Reference

### Input Signals

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `parentForm` | `FormGroup` | `null` | The parent reactive form |
| `controlName` | `string` | `""` | Form control name |
| `placeholder` | `string` | `""` | Placeholder text |
| `labelText` | `string` | `""` | Label above input |
| `errorText` | `string` | `"ערך לא תקין"` | Error message |
| `size` | `string` | `""` | CSS class for sizing |
| `customStyle` | `string` | `""` | Additional CSS classes |
| `disabled` | `boolean` | `false` | Disable the input |
| `items` | `any[]` | `[]` | Array of items for autocomplete |
| `optionLabel` | `string` | `'name'` | Property name to display |
| `dropdown` | `boolean` | `true` | Show dropdown button |
| `forceSelection` | `boolean` | `false` | Only allow selection from list |
| `showAddNew` | `boolean` | `false` | Show "Add New" button in footer |
| `addNewLabel` | `string` | `'+ הוסף חדש'` | Label for add new button |
| `headerText` | `string` | `''` | Header text above suggestions |

### Output Signals

| Event | Payload | Description |
|-------|---------|-------------|
| `onCompleteMethod` | `AutoCompleteCompleteEvent` | Emitted when user types for filtering |
| `onItemSelect` | `any` | Emitted when item is selected |
| `onAddNew` | `string` | Emitted when "Add New" is clicked |

## Example: Client Selection with "Add New"

```typescript
export class ClientFormComponent {
  clientForm: FormGroup;
  clients = signal<Client[]>([]);
  filteredClients = signal<Client[]>([]);

  constructor(
    private fb: FormBuilder,
    private clientService: ClientService,
    private dialogService: DialogService
  ) {
    this.clientForm = this.fb.group({
      recipientName: ['', Validators.required],
      recipientEmail: ['', [Validators.email]],
      recipientPhone: ['']
    });
  }

  ngOnInit() {
    this.clientService.getClients().subscribe(clients => {
      this.clients.set(clients);
    });
  }

  filterClients(event: any) {
    const query = event.query.toLowerCase();
    
    if (!query) {
      this.filteredClients.set([...this.clients()]);
      return;
    }

    const filtered = this.clients().filter(client => 
      client.name?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query)
    );
    
    this.filteredClients.set(filtered);
  }

  onClientSelect(client: Client) {
    // Auto-fill other fields
    this.clientForm.patchValue({
      recipientName: client.name,
      recipientEmail: client.email,
      recipientPhone: client.phone
    });
  }

  onAddNewClient(name: string) {
    // Open dialog to add new client
    const ref = this.dialogService.open(AddClientDialogComponent, {
      header: 'הוסף לקוח חדש',
      data: { name }
    });

    ref.onClose.subscribe((newClient: Client) => {
      if (newClient) {
        this.clients.update(current => [...current, newClient]);
        this.clientForm.patchValue({
          recipientName: newClient.name,
          recipientEmail: newClient.email,
          recipientPhone: newClient.phone
        });
      }
    });
  }
}
```

```html
<form [formGroup]="clientForm">
  <app-input-autocomplete
    [parentForm]="clientForm"
    controlName="recipientName"
    labelText="שם הלקוח"
    placeholder="חפש או הוסף לקוח"
    [items]="filteredClients()"
    optionLabel="name"
    (onCompleteMethod)="filterClients($event)"
    (onItemSelect)="onClientSelect($event)"
    [showAddNew]="true"
    addNewLabel="+ הוסף לקוח חדש"
    (onAddNew)="onAddNewClient($event)"
    headerText="בחר לקוח קיים"
    [dropdown]="true"
    [forceSelection]="false"
    size="between"
  />

  <app-input-text
    [parentForm]="clientForm"
    controlName="recipientEmail"
    labelText="אימייל"
    placeholder="email@example.com"
    type="email"
  />

  <app-input-text
    [parentForm]="clientForm"
    controlName="recipientPhone"
    labelText="טלפון"
    placeholder="05X-XXXXXXX"
  />
</form>
```

## Key Features

✅ **Signals-based**: Uses Angular signals for reactive state management  
✅ **Best Practices**: OnPush change detection, standalone component  
✅ **RTL Support**: Works with Hebrew/RTL layouts  
✅ **Validation**: Integrates with Angular reactive forms validation  
✅ **Customizable**: Header, footer, and custom templates  
✅ **Add New Option**: Built-in support for adding new items  
✅ **Dropdown**: Optional dropdown button for showing all options  
✅ **Force Selection**: Can require selection from list only  
✅ **Fully Typed**: TypeScript interfaces for type safety
