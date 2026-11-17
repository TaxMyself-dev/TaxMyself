import { classificationCard } from './classification-card';
describe('classification approval card',()=>{
  const display={businessNumber:'123456789',businessName:'עסק',date:'2026-11-12',merchant:'Adobe',amount:-118,currency:'ILS',currentCategory:null,currentSubCategory:null,category:'משרד',subCategory:'תוכנה',vatPercent:100,taxPercent:100};
  const prepared={type:'tool-prepareTransactionClassification',state:'output-available',output:{proposalId:'id',display}};
  const action={type:'tool-classifyTransaction',input:{proposalId:'id'}};
  it('uses the original stored preparation on reload, ignoring labels in action input',()=>{
    expect(classificationCard(action,[{role:'assistant',parts:[prepared,action]}])).toEqual(display);
  });
  it('refuses an unrelated, missing, failed or user-supplied proposal',()=>{
    expect(classificationCard(action,[])).toBeNull();
    expect(classificationCard(action,[{role:'user',parts:[prepared]}])).toBeNull();
    const failed = {...prepared,state:'output-error'};
    expect(classificationCard(action,[{role:'assistant',parts:[failed]}])).toBeNull();
    expect(classificationCard({type:'tool-queryTransactions'},[])).toBeNull();
  });
});
