import { SmokeDriveFolderCleanup } from './smoke-drive-cleanup';
const name = 'Keepintax Smokeabcdefghijkl';
const folder = (id: string) => ({id, name, mimeType: 'application/vnd.google-apps.folder', parents: ['root'], trashed: false});
function setup(pages: any[]) {
  const api = {files: {list: jest.fn(), delete: jest.fn().mockResolvedValue({})}};
  for (const data of pages) api.files.list.mockResolvedValueOnce({data});
  return {api, cleanup: new SmokeDriveFolderCleanup(api as any, 'root')};
}
describe('Exact-run smoke Drive cleanup', () => {
  it('deletes all exact-run duplicates, including later pages, without widening the query', async () => {
    const {api, cleanup} = setup([{files:[folder('one')],nextPageToken:'page2'}, {files:[folder('two')]}]);
    await expect(cleanup.deleteUserFolder(name, false, 0)).resolves.toBe(true);
    expect(api.files.delete.mock.calls.map(([arg]) => arg.fileId)).toEqual(['one','two']);
    expect(api.files.list.mock.calls[0][0].q).toContain(`name = '${name}'`);
    expect(api.files.list.mock.calls[0][0].q).toContain("'root' in parents");
    expect(api.files.list.mock.calls[1][0].pageToken).toBe('page2');
  });
  it.each([
    {name:'Real customer'}, {parents:['other-root']}, {mimeType:'application/pdf'}, {id:'root'}, {trashed:true}, {id:null},
  ])('refuses every deletion if any returned target is unsafe: %j', async patch => {
    const {api, cleanup} = setup([{files:[folder('one'), {...folder('two'), ...patch}]}]);
    await expect(cleanup.deleteUserFolder(name, false, 0)).rejects.toThrow('outside');
    expect(api.files.delete).not.toHaveBeenCalled();
  });
  it('refuses a broad or malformed name before making a Drive request', async () => {
    const {api, cleanup} = setup([]);
    await expect(cleanup.deleteUserFolder('Keepintax Smoke', false, 0)).rejects.toThrow('Invalid');
    expect(api.files.list).not.toHaveBeenCalled();
  });
  it('bounds lookup and validates all pages before deleting anything', async () => {
    const {api, cleanup} = setup([{files:Array.from({length:21},(_,i)=>folder(String(i)))}]);
    await expect(cleanup.deleteUserFolder(name, false, 0)).rejects.toThrow('bound');
    expect(api.files.delete).not.toHaveBeenCalled();
  });
  it('is retry-safe after a folder disappears', async () => {
    const {api, cleanup} = setup([{files:[folder('one'),folder('two')]}]);
    api.files.delete.mockRejectedValueOnce({code:404});
    await expect(cleanup.deleteUserFolder(name,false,0)).resolves.toBe(true);
    expect(api.files.delete).toHaveBeenCalledTimes(2);
  });
  it('reports a permissions failure instead of pretending cleanup succeeded', async () => {
    const {api, cleanup} = setup([{files:[folder('one')]}]);
    api.files.delete.mockRejectedValueOnce(new Error('permission denied'));
    await expect(cleanup.deleteUserFolder(name,false,0)).rejects.toThrow('permission denied');
  });
  it('succeeds idempotently when no matching folder remains', async () => {
    const {api, cleanup} = setup([{files:[]}]);
    await expect(cleanup.deleteUserFolder(name,false,0)).resolves.toBe(false);
    expect(api.files.delete).not.toHaveBeenCalled();
  });
});
