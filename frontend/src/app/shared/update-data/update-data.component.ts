import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';


@Component({
  selector: 'app-update-data',
  templateUrl: './update-data.component.html',
  styleUrls: ['./update-data.component.scss']
})
export class UpdateDataComponent implements OnInit, OnChanges {

  @Input() blocksData: any[] = [];
  @Input() updateFunction: (data: any) => void;  // Accept a generic update function

  updateForm: FormGroup;
  formTypes: any;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.updateForm = this.fb.group({
      blocks: this.fb.array([]), // Start with an empty array for blocks
    });
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes.blocksData && this.blocksData) {
      console.log("Debug block data is ", this.blocksData);
      // Dynamically create form controls when blocksData changes
      this.initializeBlocks(this.blocksData);
    }
  }
  

  // Get the blocks array
  get blocks(): FormArray {
    return this.updateForm.get('blocks') as FormArray;
  }


  initializeBlocks(blocksData: any[]) {
    const blocksFormArray = this.updateForm.get('blocks') as FormArray;
  
    blocksData.forEach(blockData => {
      // Create a form group for each block
      const block = this.fb.group({
        fields: this.fb.array([]),  // Each block contains an array of fields
      });
  
      const fieldsFormArray = block.get('fields') as FormArray;
  
      // Loop through each field in the block and create a form group for each field
      blockData.fields.forEach(fieldData => {
        const field = this.fb.group({
          value: this.fb.control(fieldData.value)  // Each field has a 'value' control
        });
        fieldsFormArray.push(field);  // Add the field to the fields array
      });
  
      // Add the block to the blocks array
      blocksFormArray.push(block);
    });
  }


  // saveChanges() {
  //   if (this.updateFunction) {
  //     const updatedData = this.updateForm.value;
  //     console.log("saveChanges - updateData is ", updatedData);
      
  //     this.updateFunction(updatedData);  // Call the function passed by the parent
  //   } else {
  //     console.error('No update function provided.');
  //   }
  // }


  saveChanges() {
    if (this.updateFunction) {
      const updatedData = this.flattenFormData(this.updateForm.value, this.blocksData);
      console.log("saveChanges - dynamically flattened data is ", updatedData);
      this.updateFunction(updatedData);  // Call the function passed by the parent
    } else {
      console.error('No update function provided.');
    }
  }


  flattenFormData(formData: any, blocksData: any[]): any {
    const flattenedData = {};
  
    formData.blocks.forEach((block, blockIndex) => {
      block.fields.forEach((field, fieldIndex) => {
        // Use the field's name from blocksData to create the flattened structure
        const fieldName = blocksData[blockIndex]?.fields[fieldIndex]?.name;
        if (fieldName) {
          // Assign the field value to the corresponding field name in flattenedData
          flattenedData[fieldName] = field.value;
        }
      });
    });
  
    return flattenedData;
  }


}
