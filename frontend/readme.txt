
# deploy to firebase:

# building public production files
npm run build

# if needed: 
firebase login --reauth

firebase deploy -P prod --only hosting