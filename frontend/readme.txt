########################################
######## deploy app to firebase ########
########################################

cd frontend

# building public production files
npm run build

# if needed: 
firebase login --reauth

firebase deploy --only hosting:app
#firebase deploy -P prod --only hosting


########################################
###### deploy landing to firebase ######
########################################

cd landing

npm run build

firebase use prod

firebase deploy --only hosting:landing