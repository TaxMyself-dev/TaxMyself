# Synthetic fixtures only; passwords here are test constants, never user credentials.
from pathlib import Path
from pypdf import PdfWriter
out = Path(__file__).parent
fixtures = [('open.pdf', None, None), ('password-required.pdf', 'fixture-only-password', None), ('permissions-only.pdf', '', None), ('password-required-aes256.pdf', 'fixture-only-password', 'AES-256'), ('permissions-only-aes256.pdf', '', 'AES-256')]
for name, password, algorithm in fixtures:
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.add_metadata({'/Producer': 'KeepInTax synthetic test fixture'})
    if password is not None:
        options = {'algorithm': algorithm} if algorithm else {'use_128bit': True}
        writer.encrypt(user_password=password, owner_password='fixture-only-owner', permissions_flag=0, **options)
    with (out / name).open('wb') as target:
        writer.write(target)
