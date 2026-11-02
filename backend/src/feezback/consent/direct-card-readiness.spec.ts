import { canClassifyDirectCard, DirectCardReadiness } from './direct-card-readiness';
const card={resourceId:'r',consentId:'c',maskedPan:'531084******7533',currency:'ILS'};
const ref={cashAccountType:'CARD',maskedPan:card.maskedPan,currency:'ILS'};
const proof:DirectCardReadiness={sub:'owner_sub',consentId:'c',fetchedAccounts:[ref],failedToFetchAccounts:[]};
describe('direct card readiness',()=>{
  it('requires an explicit data-ready proof',()=>expect(canClassifyDirectCard(card,'owner_sub')).toBe(false));
  it('accepts a successfully fetched card only in its own identity and consent',()=>{
    expect(canClassifyDirectCard(card,'owner_sub',proof)).toBe(true);
    expect(canClassifyDirectCard(card,'owner_sub_spouse',proof)).toBe(false);
    expect(canClassifyDirectCard({...card,consentId:'other'},'owner_sub',proof)).toBe(false);
  });
  it('gives failures precedence over successes',()=>expect(canClassifyDirectCard(card,'owner_sub',{...proof,failedToFetchAccounts:[ref]})).toBe(false));
  it('treats a less detailed failed-card reference conservatively',()=>expect(canClassifyDirectCard(card,'owner_sub',{...proof,failedToFetchAccounts:[{cashAccountType:'CARD',maskedPan:'****7533'}]})).toBe(false));
  it('preserves classification when a failed source cannot be identified',()=>expect(canClassifyDirectCard(card,'owner_sub',{...proof,failedToFetchAccounts:[{}]})).toBe(false));
  it('does not authorize missing or malformed lists',()=>{
    for(const value of [undefined,null,{}]){
      expect(canClassifyDirectCard(card,'owner_sub',{...proof,fetchedAccounts:value})).toBe(false);
      expect(canClassifyDirectCard(card,'owner_sub',{...proof,failedToFetchAccounts:value})).toBe(false);
    }
  });
  it('does not confuse a different card, bank account, or currency',()=>{
    for(const other of [{...ref,maskedPan:'123456******7533'},{...ref,currency:'USD'},{...ref,cashAccountType:'CACC'}])
      expect(canClassifyDirectCard(card,'owner_sub',{...proof,fetchedAccounts:[other]})).toBe(false);
  });
  it('accepts exact provider resource references and related consent coverage',()=>{
    expect(canClassifyDirectCard(card,'owner_sub',{...proof,fetchedAccounts:[{resourceId:'r'}]})).toBe(true);
    expect(canClassifyDirectCard({...card,consentId:'new',relatedConsents:[{resourceId:'c'}]},'owner_sub',proof)).toBe(true);
  });
});
