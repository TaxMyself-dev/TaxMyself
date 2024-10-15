import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';

@Component({
  selector: 'app-update-data',
  templateUrl: './update-data.component.html',
  styleUrls: ['./update-data.component.scss']
})
export class UpdateDataComponent implements OnInit, OnChanges {

  // @Input() blocksData: { 
  //   title: string; 
  //   enabled?: boolean;  // Optional enabled flag for the block
  //   fields: { 
  //     name: string; 
  //     value: string; 
  //     enabled?: boolean;  // Optional enabled flag for the field
  //   }[] 
  // }[] = [];

  @Input() blocksData: { 
    title: string; 
    enabled?: boolean;  // Optional enabled flag for the block
    fields: { 
      name: string; 
      value: string; 
      enabled?: boolean;  // Optional enabled flag for the field
      type?: string;  // Optional type field (e.g., 'select')
      options?: { value: string | number; name: string }[];  // Optional list of options for select fields
      controlName?: string;  // Optional form control name for select fields
    }[] 
  }[] = [];
  

  updateForm: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.updateForm = this.fb.group({
      blocks: this.fb.array([]),
    });
  }

  // Handle changes to @Input() blocksData, this will be called when blocksData is updated asynchronously
  ngOnChanges(changes: SimpleChanges) {
    if (changes.blocksData && changes.blocksData.currentValue) {
      this.initializeBlocks(changes.blocksData.currentValue);
    }
  }

  // Get the blocks array
  get blocks(): FormArray {
    return this.updateForm.get('blocks') as FormArray;
  }

  // Initialize the form blocks and fields based on input data
  initializeBlocks(blocksData: { title: string, fields: { name: string, value: string }[] }[]) {

    console.log("initializeBlocks: blocksData is ", blocksData);  // Log blocksData
    
    const blocksFormArray = this.fb.array([]) as FormArray;  // Explicitly typed as FormArray
  
    blocksData.forEach(blockData => {
      // Create a FormGroup for each block
      const block = this.fb.group({
        title: [blockData.title],
        fields: this.fb.array([]),  // FormArray for the fields in this block
      });
  
      // Loop through each field in the block and add it to the fields array
      blockData.fields.forEach(fieldData => {
        const field = this.fb.group({
          name: [fieldData.name],
          value: [fieldData.value],
        });
        (block.get('fields') as FormArray).push(field);  // Push the field into the FormArray
      });
  
      blocksFormArray.push(block);  // Push the block (FormGroup) into the blocksFormArray
    });
  
    // Reset the form array with new data
    this.updateForm.setControl('blocks', blocksFormArray);
  }

  saveChanges() {
    console.log(this.updateForm.value);
  }
}
