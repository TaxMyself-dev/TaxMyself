# PDF font assets

Simpler Regular and Bold are the existing application fonts converted from
OpenType/CFF to TrueType outlines. The conversion uses fonttools 4.55.3,
Cu2QuPen with max_err=0.5 font units and reverse_direction=True. Glyph order,
advance widths, side bearings and Unicode mapping were preserved. Original
font names, layout tables and embedding flags were retained.

Only the PDF assets changed; frontend fonts remain unchanged. TrueType is used
because Chromium emitted Type3 for the original CFF assets, and the user
reproduced a Mi Reader failure only after FillFaster signing. The converted
fonts emitted embedded Type0/CIDFontType2 and opened in both cases.

Both renderers and the shared footer CSS must use these TTF files. The backend
Nest assets glob and PDF-service Docker directory copy include them unchanged.
Do not convert, flatten or rewrite a PDF after signing.

These are existing proprietary font assets, not a new third-party font licence.
