########################################
######## deploy app to firebase ########
########################################

cd frontend

# building public production files
npm run build

# if needed: 
firebase login --reauth

firebase deploy -P prod --only hosting:app


########################################
###### deploy landing to firebase ######
########################################

cd landing

npm run build

firebase use prod

firebase deploy -P prod --only hosting:landing